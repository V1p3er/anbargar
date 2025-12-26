import json
import random
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.files.storage import FileSystemStorage
from django.db import transaction
from django.db.models import F, FloatField, Sum
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .api_utils import create_access_token, decode_access_token
from .models import (
    Business,
    Customer,
    Event,
    EventItem,
    EventType,
    Folder,
    FolderItem,
    Item,
    Otp,
    Unit,
)


def home_index(request):
    return render(request, "home/index.html")


def _get_primary_business(user):
    return user.businesses.first()


def _ensure_business(user):
    business = _get_primary_business(user)
    if business:
        return business

    business = Business.objects.create(name="My Business")
    business.users.add(user)
    return business


def _get_display_name(user):
    full_name = user.get_full_name().strip()
    return full_name or user.username


@login_required
def dashboard(request):
    business = _ensure_business(request.user)
    stats = {
        "total_items": 0,
        "total_folders": 0,
        "total_value": 0,
        "low_stock_count": 0,
    }
    recent_events = []
    low_stock_items = []

    if business:
        stats["total_items"] = Item.objects.filter(business=business).count()
        stats["total_folders"] = Folder.objects.filter(business=business).count()

        total_value = FolderItem.objects.filter(
            folder__business=business,
            item__value__isnull=False,
        ).aggregate(
            total=Sum(F("quantity") * F("item__value"), output_field=FloatField())
        )["total"] or 0
        stats["total_value"] = int(total_value)

        low_stock_items = FolderItem.objects.filter(
            folder__business=business,
            quantity__gt=0,
            quantity__lt=5,
        ).select_related("item", "folder")
        stats["low_stock_count"] = low_stock_items.count()

        recent_events = (
            Event.objects.filter(business=business)
            .select_related("customer")
            .order_by("-created_at")[:5]
        )

    context = {
        "stats": stats,
        "recent_events": recent_events,
        "low_stock_items": low_stock_items[:5],
        "display_name": _get_display_name(request.user),
    }
    return render(request, "home/dashboard.html", context)


def _json_response(data, status=200):
    return JsonResponse(data, status=status, safe=isinstance(data, dict))


def _parse_json(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        return None


def _error(message, status=400):
    return _json_response({"detail": message}, status=status)


def _get_bearer_token(request):
    auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None


def _get_current_user(request):
    token = _get_bearer_token(request)
    if not token:
        return None, _error("Authentication required.", status=401)

    payload = decode_access_token(token)
    if not payload or "user_id" not in payload:
        return None, _error("Invalid token.", status=401)

    try:
        return User.objects.get(id=payload["user_id"]), None
    except User.DoesNotExist:
        return None, _error("User not found.", status=401)


@login_required
@require_http_methods(["GET"])
def api_session_token(request):
    _ensure_business(request.user)
    return _json_response({"token": create_access_token(request.user.id)})


def _serialize_item(item):
    return {
        "id": str(item.id),
        "name": item.name,
        "sku": item.sku,
        "barcode": item.barcode,
        "description": item.description,
        "value": item.value,
        "has_qr_code": item.has_qr_code,
        "business_id": str(item.business_id),
    }


def _serialize_folder(folder):
    return {
        "id": str(folder.id),
        "name": folder.name,
        "description": folder.description,
        "parent_id": str(folder.parent_id) if folder.parent_id else None,
        "business_id": str(folder.business_id),
    }


def _serialize_unit(unit):
    return {
        "id": str(unit.id),
        "name": unit.name,
        "symbol": unit.symbol,
        "description": unit.description,
        "business_id": str(unit.business_id),
    }


def _serialize_customer(customer):
    return {
        "id": str(customer.id),
        "first_name": customer.first_name,
        "last_name": customer.last_name,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "business_id": str(customer.business_id),
    }


def _serialize_event(event):
    return {
        "id": str(event.id),
        "type": event.type,
        "description": event.description,
        "createdAt": event.created_at,
    }


def _update_inventory_single_item(folder_id, item_id, quantity, operation, item_unit):
    if not folder_id or not item_id:
        return

    folder_item = FolderItem.objects.filter(folder_id=folder_id, item_id=item_id).first()

    if folder_item:
        if operation == "add":
            folder_item.quantity += quantity
        elif operation == "subtract":
            folder_item.quantity = max(0, folder_item.quantity - quantity)
        folder_item.save(update_fields=["quantity", "updated_at"])
    elif operation == "add":
        FolderItem.objects.create(
            folder_id=folder_id,
            item_id=item_id,
            quantity=quantity,
            unit=item_unit or "unit",
        )


def _reverse_event_inventory(event):
    items = event.event_items.all()
    for event_item in items:
        if not event_item.item_id:
            continue

        if event.type == EventType.BUY and event.folder_id:
            _update_inventory_single_item(
                event.folder_id,
                event_item.item_id,
                event_item.quantity,
                "subtract",
                event_item.unit,
            )
        elif event.type == EventType.SELL and event.folder_id:
            _update_inventory_single_item(
                event.folder_id,
                event_item.item_id,
                event_item.quantity,
                "add",
                event_item.unit,
            )
        elif event.type == EventType.MOVE and event.origin_folder_id and event.destination_folder_id:
            _update_inventory_single_item(
                event.origin_folder_id,
                event_item.item_id,
                event_item.quantity,
                "add",
                event_item.unit,
            )
            _update_inventory_single_item(
                event.destination_folder_id,
                event_item.item_id,
                event_item.quantity,
                "subtract",
                event_item.unit,
            )


@csrf_exempt
@require_http_methods(["POST"])
def api_register(request):
    data = _parse_json(request)
    if data is None:
        return _error("Invalid JSON payload.")

    phone = (data.get("phone") or "").strip()
    name = (data.get("name") or "").strip()
    password = data.get("password")
    business_name = (data.get("business_name") or "").strip() or "My Business"

    if not phone or not name or not password:
        return _error("Phone, name, and password are required.")

    if User.objects.filter(username=phone).exists():
        return _error("User with this phone already exists.", status=400)

    with transaction.atomic():
        user = User.objects.create_user(username=phone, password=password, first_name=name)
        business = Business.objects.create(name=business_name)
        business.users.add(user)

    access_token = create_access_token(user.id)
    return _json_response(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "name": user.first_name,
                "phone": user.username,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_login(request):
    data = _parse_json(request)
    if data is None:
        return _error("Invalid JSON payload.")

    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""

    if not phone or not password:
        return _error("Phone and password are required.")

    user = authenticate(request, username=phone, password=password)
    if user is None:
        return _error("Phone number or password is incorrect.", status=403)

    access_token = create_access_token(user.id)
    return _json_response(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "name": user.first_name,
                "phone": user.username,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_send_otp(request):
    data = _parse_json(request)
    if data is None:
        return _error("Invalid JSON payload.")

    phone = (data.get("phone") or "").strip()
    if not phone:
        return _error("Phone is required.")

    existing_otp = (
        Otp.objects.filter(phone=phone, expires_at__gt=timezone.now(), verified=False)
        .order_by("-created_at")
        .first()
    )
    if existing_otp:
        time_diff = timezone.now() - existing_otp.created_at
        if time_diff.total_seconds() < 60:
            return _error("Please wait before requesting another OTP.", status=429)

    code = f"{random.randint(100000, 999999)}"
    expires_at = timezone.now() + timedelta(minutes=2)

    Otp.objects.create(phone=phone, code=code, expires_at=expires_at)

    print(f"DEV SMS Code for {phone}: {code}")
    return _json_response({"message": "OTP sent.", "dev_hint": code})


@csrf_exempt
@require_http_methods(["POST"])
def api_verify_otp(request):
    data = _parse_json(request)
    if data is None:
        return _error("Invalid JSON payload.")

    phone = (data.get("phone") or "").strip()
    code = (data.get("code") or "").strip()
    if not phone or not code:
        return _error("Phone and code are required.")

    otp_record = Otp.objects.filter(
        phone=phone,
        code=code,
        expires_at__gt=timezone.now(),
        verified=False,
    ).first()

    if not otp_record:
        return _error("Invalid or expired code.", status=400)

    otp_record.verified = True
    otp_record.save(update_fields=["verified"])

    user = User.objects.filter(username=phone).first()
    if not user:
        user = User.objects.create_user(username=phone)
        user.set_unusable_password()
        user.save()
        business = Business.objects.create(name="My Business")
        business.users.add(user)

    access_token = create_access_token(user.id)
    return _json_response(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "name": user.first_name,
                "phone": user.username,
            },
        }
    )


@require_http_methods(["GET"])
def api_dashboard_stats(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    total_items = Item.objects.filter(business=business).count()
    total_folders = Folder.objects.filter(business=business).count()
    total_value = FolderItem.objects.filter(
        folder__business=business,
        item__value__isnull=False,
    ).aggregate(
        total=Sum(F("quantity") * F("item__value"), output_field=FloatField())
    )["total"] or 0
    low_stock_count = FolderItem.objects.filter(
        folder__business=business,
        quantity__gt=0,
        quantity__lt=5,
    ).count()

    return _json_response(
        {
            "total_items": total_items,
            "total_folders": total_folders,
            "total_value": int(total_value),
            "low_stock_count": low_stock_count,
        }
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_folders(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    if request.method == "POST":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")
        name = (data.get("name") or "").strip()
        if not name:
            return _error("Folder name is required.")

        folder = Folder.objects.create(
            name=name,
            description=data.get("description"),
            parent_id=data.get("parent_id") or None,
            business=business,
        )
        return _json_response(_serialize_folder(folder))

    folders = Folder.objects.filter(business=business)
    return _json_response([_serialize_folder(folder) for folder in folders])


@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def api_folder_detail(request, folder_id):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)
    folder = Folder.objects.filter(id=folder_id, business=business).first()
    if not folder:
        return _error("Folder not found.", status=404)

    if request.method == "GET":
        return _json_response(_serialize_folder(folder))

    if request.method == "PATCH":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return _error("Folder name is required.")
            folder.name = name

        if "description" in data:
            folder.description = data.get("description") or None

        if "parent_id" in data:
            parent_id = data.get("parent_id") or None
            if parent_id:
                parent_folder = Folder.objects.filter(id=parent_id, business=business).first()
                if not parent_folder:
                    return _error("Parent folder not found.", status=404)
            folder.parent_id = parent_id

        folder.save(update_fields=["name", "description", "parent_id", "updated_at"])
        return _json_response(_serialize_folder(folder))

    folder.delete()
    return _json_response({}, status=204)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_items(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    if request.method == "POST":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        name = (data.get("name") or "").strip()
        if not name:
            return _error("Item name is required.")

        barcode = data.get("barcode")
        if barcode:
            existing_item = Item.objects.filter(barcode=barcode, business=business).first()
            if existing_item:
                return _error("Item with this barcode already exists.", status=400)

        item = Item.objects.create(
            name=name,
            sku=data.get("sku"),
            barcode=barcode,
            description=data.get("description"),
            value=data.get("value"),
            has_qr_code=bool(data.get("has_qr_code")),
            business=business,
        )
        return _json_response(_serialize_item(item))

    items = Item.objects.filter(business=business)
    return _json_response([_serialize_item(item) for item in items])


@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def api_item_detail(request, item_id):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)
    item = Item.objects.filter(id=item_id, business=business).first()
    if not item:
        return _error("Item not found.", status=404)

    if request.method == "GET":
        return _json_response(_serialize_item(item))

    if request.method == "PATCH":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return _error("Item name is required.")
            item.name = name

        if "sku" in data:
            item.sku = (data.get("sku") or "").strip() or None

        if "barcode" in data:
            barcode = (data.get("barcode") or "").strip() or None
            if barcode and Item.objects.filter(barcode=barcode).exclude(id=item.id).exists():
                return _error("Item with this barcode already exists.", status=400)
            item.barcode = barcode

        if "description" in data:
            item.description = data.get("description") or None

        if "value" in data:
            item.value = data.get("value")

        if "has_qr_code" in data:
            item.has_qr_code = bool(data.get("has_qr_code"))

        item.save(update_fields=["name", "sku", "barcode", "description", "value", "has_qr_code", "updated_at"])
        return _json_response(_serialize_item(item))

    item.delete()
    return _json_response({}, status=204)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_units(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    if request.method == "POST":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        name = (data.get("name") or "").strip()
        symbol = (data.get("symbol") or "").strip()
        if not name or not symbol:
            return _error("Unit name and symbol are required.")

        unit = Unit.objects.create(
            name=name,
            symbol=symbol,
            description=data.get("description"),
            business=business,
        )
        return _json_response(_serialize_unit(unit))

    units = Unit.objects.filter(business=business)
    return _json_response([_serialize_unit(unit) for unit in units])


@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def api_unit_detail(request, unit_id):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)
    unit = Unit.objects.filter(id=unit_id, business=business).first()
    if not unit:
        return _error("Unit not found.", status=404)

    if request.method == "GET":
        return _json_response(_serialize_unit(unit))

    if request.method == "PATCH":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return _error("Unit name is required.")
            unit.name = name

        if "symbol" in data:
            symbol = (data.get("symbol") or "").strip()
            if not symbol:
                return _error("Unit symbol is required.")
            unit.symbol = symbol

        if "description" in data:
            unit.description = data.get("description") or None

        unit.save(update_fields=["name", "symbol", "description", "updated_at"])
        return _json_response(_serialize_unit(unit))

    unit.delete()
    return _json_response({}, status=204)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_customers(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    if request.method == "POST":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        first_name = (data.get("first_name") or "").strip()
        if not first_name:
            return _error("Customer first name is required.")

        phone = (data.get("phone") or "").strip() or None
        if phone and Customer.objects.filter(phone=phone, business=business).exists():
            return _error("Customer with this phone already exists.", status=400)

        customer = Customer.objects.create(
            first_name=first_name,
            last_name=data.get("last_name"),
            phone=phone,
            email=data.get("email"),
            address=data.get("address"),
            business=business,
        )
        return _json_response(_serialize_customer(customer))

    customers = Customer.objects.filter(business=business)
    return _json_response([_serialize_customer(customer) for customer in customers])


@csrf_exempt
@require_http_methods(["GET", "PATCH", "DELETE"])
def api_customer_detail(request, customer_id):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)
    customer = Customer.objects.filter(id=customer_id, business=business).first()
    if not customer:
        return _error("Customer not found.", status=404)

    if request.method == "GET":
        return _json_response(_serialize_customer(customer))

    if request.method == "PATCH":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        if "first_name" in data:
            first_name = (data.get("first_name") or "").strip()
            if not first_name:
                return _error("Customer first name is required.")
            customer.first_name = first_name

        if "last_name" in data:
            customer.last_name = (data.get("last_name") or "").strip() or None

        if "phone" in data:
            phone = (data.get("phone") or "").strip() or None
            if phone and Customer.objects.filter(phone=phone, business=business).exclude(id=customer.id).exists():
                return _error("Customer with this phone already exists.", status=400)
            customer.phone = phone

        if "email" in data:
            email = (data.get("email") or "").strip() or None
            if email and Customer.objects.filter(email=email).exclude(id=customer.id).exists():
                return _error("Customer with this email already exists.", status=400)
            customer.email = email

        if "address" in data:
            customer.address = data.get("address") or None

        customer.save(
            update_fields=["first_name", "last_name", "phone", "email", "address", "updated_at"]
        )
        return _json_response(_serialize_customer(customer))

    customer.delete()
    return _json_response({}, status=204)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_events(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    if request.method == "POST":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        event_type = data.get("type")
        if event_type not in EventType.values:
            return _error("Invalid event type.")

        items = data.get("items") or []
        if not isinstance(items, list) or not items:
            return _error("Event items are required.")

        customer_id = None
        customer_name = (data.get("customer_name") or "").strip()
        customer_phone = (data.get("customer_phone") or "").strip()
        customer_address = (data.get("customer_address") or "").strip()

        if event_type == EventType.SELL and (customer_name or customer_phone):
            first_name = ""
            last_name = ""
            if customer_name:
                parts = customer_name.split(" ", 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ""

            customer = None
            if customer_phone:
                customer = Customer.objects.filter(
                    business=business,
                    phone=customer_phone,
                ).first()

            if customer:
                customer.first_name = first_name or customer.first_name
                customer.last_name = last_name or customer.last_name
                if customer_address:
                    customer.address = customer_address
                customer.save()
            else:
                customer = Customer.objects.create(
                    business=business,
                    first_name=first_name or "Customer",
                    last_name=last_name or None,
                    phone=customer_phone or None,
                    address=customer_address or None,
                )
            customer_id = customer.id

        try:
            with transaction.atomic():
                event = Event.objects.create(
                    type=event_type,
                    description=data.get("description"),
                    business=business,
                    customer_id=customer_id,
                    folder_id=data.get("folder_id") or None,
                    origin_folder_id=data.get("origin_folder_id") or None,
                    destination_folder_id=data.get("destination_folder_id") or None,
                )

                for item_data in items:
                    name = (item_data.get("name") or "").strip()
                    quantity = item_data.get("quantity")
                    if not name or quantity is None:
                        raise ValueError("Each event item requires a name and quantity.")

                    item_id = item_data.get("item_id") or None
                    if not item_id:
                        matches = list(
                            Item.objects.filter(business=business, name__iexact=name).values_list("id", flat=True)[:2]
                        )
                        if len(matches) == 1:
                            item_id = matches[0]

                    event_item = EventItem.objects.create(
                        event=event,
                        item_id=item_id,
                        name=name,
                        quantity=quantity,
                        unit=item_data.get("unit"),
                        value=item_data.get("value"),
                        sku=item_data.get("sku"),
                        barcode=item_data.get("barcode"),
                    )

                    if event_item.item_id:
                        if event_type == EventType.BUY and event.folder_id:
                            _update_inventory_single_item(
                                event.folder_id,
                                event_item.item_id,
                                event_item.quantity,
                                "add",
                                event_item.unit,
                            )
                        elif event_type == EventType.SELL and event.folder_id:
                            _update_inventory_single_item(
                                event.folder_id,
                                event_item.item_id,
                                event_item.quantity,
                                "subtract",
                                event_item.unit,
                            )
                        elif event_type == EventType.MOVE and event.origin_folder_id and event.destination_folder_id:
                            _update_inventory_single_item(
                                event.origin_folder_id,
                                event_item.item_id,
                                event_item.quantity,
                                "subtract",
                                event_item.unit,
                            )
                            _update_inventory_single_item(
                                event.destination_folder_id,
                                event_item.item_id,
                                event_item.quantity,
                                "add",
                                event_item.unit,
                            )
        except ValueError as exc:
            return _error(str(exc))

        return _json_response(_serialize_event(event))

    events = Event.objects.filter(business=business)
    return _json_response([_serialize_event(event) for event in events])


@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def api_event_detail(request, event_id):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)
    event = (
        Event.objects.filter(id=event_id, business=business)
        .prefetch_related("event_items")
        .first()
    )
    if not event:
        return _error("Event not found.", status=404)

    if request.method == "PATCH":
        data = _parse_json(request)
        if data is None:
            return _error("Invalid JSON payload.")

        if "description" in data:
            event.description = data.get("description") or None
            event.save(update_fields=["description", "updated_at"])

        return _json_response(_serialize_event(event))

    with transaction.atomic():
        _reverse_event_inventory(event)
        event.delete()
    return _json_response({}, status=204)


@require_http_methods(["GET"])
def api_inventory(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    items = FolderItem.objects.filter(folder__business=business).select_related("item", "folder")
    return _json_response(
        [
            {
                "id": str(entry.id),
                "folder_id": str(entry.folder_id),
                "folder_name": entry.folder.name,
                "item_id": str(entry.item_id),
                "item_name": entry.item.name,
                "quantity": entry.quantity,
                "unit": entry.unit,
            }
            for entry in items
        ]
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_upload(request):
    upload_file = request.FILES.get("file")
    if not upload_file:
        return _error("File is required.")

    upload_dir = settings.BASE_DIR / "uploads"
    upload_dir.mkdir(exist_ok=True)

    file_ext = upload_file.name.split(".")[-1]
    file_name = f"{uuid.uuid4()}.{file_ext}"
    storage = FileSystemStorage(location=upload_dir, base_url=settings.MEDIA_URL)
    saved_name = storage.save(file_name, upload_file)
    return _json_response({"url": storage.url(saved_name)})


def _calculate_burn_rate(sales_data):
    if not sales_data:
        return 0.0

    daily_totals = {}
    for sale_date, quantity in sales_data:
        day = sale_date.date()
        daily_totals[day] = daily_totals.get(day, 0) + quantity

    if not daily_totals:
        return 0.0

    return sum(daily_totals.values()) / len(daily_totals)


@require_http_methods(["GET"])
def api_ai_predict_stockout(request):
    user, error = _get_current_user(request)
    if error:
        return error

    business = _ensure_business(user)

    try:
        days_history = int(request.GET.get("days_history", 30))
    except ValueError:
        return _error("days_history must be an integer.")

    predictions = []
    risky_items_count = 0
    cutoff_date = timezone.now() - timedelta(days=days_history)

    items = Item.objects.filter(business=business)
    for item in items:
        total_quantity = (
            FolderItem.objects.filter(item=item).aggregate(total=Sum("quantity"))["total"] or 0
        )
        if total_quantity == 0:
            continue

        sales = EventItem.objects.filter(
            event__business=business,
            event__type=EventType.SELL,
            item=item,
            event__created_at__gte=cutoff_date,
        ).values_list("event__created_at", "quantity")

        daily_burn_rate = _calculate_burn_rate(list(sales))

        if daily_burn_rate > 0:
            days_left = int(total_quantity / daily_burn_rate)
            if days_left <= 3:
                suggestion = "Restock urgently."
                risky_items_count += 1
            elif days_left <= 7:
                suggestion = "Plan a restock soon."
                risky_items_count += 1
            elif days_left <= 14:
                suggestion = "Monitor stock levels closely."
            else:
                suggestion = "Stock levels are healthy."

            predictions.append(
                {
                    "item_id": str(item.id),
                    "item_name": item.name,
                    "current_quantity": total_quantity,
                    "avg_daily_sales": round(daily_burn_rate, 2),
                    "days_until_stockout": days_left,
                    "suggestion": suggestion,
                }
            )
        else:
            predictions.append(
                {
                    "item_id": str(item.id),
                    "item_name": item.name,
                    "current_quantity": total_quantity,
                    "avg_daily_sales": 0,
                    "days_until_stockout": 999,
                    "suggestion": "Not enough sales data.",
                }
            )

    predictions.sort(key=lambda x: x["days_until_stockout"])
    return _json_response({"predictions": predictions, "total_low_stock_risk": risky_items_count})

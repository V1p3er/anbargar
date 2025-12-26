import re
import unicodedata

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import redirect, render
from django.urls import reverse
from urllib.parse import urlencode

from home.models import Business

PHONE_RE = re.compile(r"^\d{10,15}$")


def normalize_phone(value):
    if not value:
        return ""
    digits = []
    for ch in value:
        if ch.isdigit():
            try:
                digits.append(str(unicodedata.digit(ch)))
            except (TypeError, ValueError):
                digits.append(ch)
    return "".join(digits)


def _get_next_url(request):
    next_url = request.POST.get("next") or request.GET.get("next")
    if next_url:
        return next_url
    return reverse("dashboard")


def _redirect_with_phone(request, phone_value):
    params = {}
    next_url = request.POST.get("next") or request.GET.get("next")
    if next_url:
        params["next"] = next_url
    if phone_value:
        params["phone"] = phone_value
    if params:
        base_url = reverse("auth")
        return redirect(f"{base_url}?{urlencode(params)}")
    return redirect("auth")


def logout_view(request):
    logout(request)
    return redirect("auth")


def auth_index(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    error = None
    phone_value = normalize_phone(request.GET.get("phone", ""))

    if request.method == "POST":
        action = request.POST.get("action", "login")
        phone_raw = request.POST.get("phone", "")
        password = request.POST.get("password", "")

        phone_value = normalize_phone(phone_raw)

        if not phone_value or not PHONE_RE.match(phone_value):
            error = "Invalid phone number."
        elif not password:
            error = "Password is required."
        elif action == "signup":
            if User.objects.filter(username=phone_value).exists():
                error = "This phone number is already registered."
            else:
                with transaction.atomic():
                    user = User.objects.create_user(username=phone_value, password=password)
                    business = Business.objects.create(name="My Business")
                    business.users.add(user)
                login(request, user)
                return redirect(_get_next_url(request))
        else:
            user = authenticate(request, username=phone_value, password=password)
            if user is None:
                error = "Phone number or password is incorrect."
            else:
                login(request, user)
                return redirect(_get_next_url(request))

        if error:
            messages.error(request, error)
            return _redirect_with_phone(request, phone_value)

    next_value = request.GET.get("next", "")
    context = {
        "error": error,
        "phone": phone_value,
        "next": next_value,
    }
    return render(request, "auth/auth.html", context)

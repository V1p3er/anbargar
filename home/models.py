import uuid

from django.contrib.auth.models import User
from django.db import models


class Business(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    users = models.ManyToManyField(User, related_name="businesses")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Otp(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, db_index=True)
    code = models.CharField(max_length=10)
    expires_at = models.DateTimeField()
    verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.phone} ({self.code})"


class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="folders")
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="children",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Item(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=255, blank=True, null=True)
    barcode = models.CharField(max_length=255, blank=True, null=True, unique=True)
    has_qr_code = models.BooleanField(default=False)
    description = models.TextField(blank=True, null=True)
    value = models.FloatField(blank=True, null=True)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ItemImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    url = models.CharField(max_length=500)
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="images")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Unit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    symbol = models.CharField(max_length=50)
    description = models.TextField(blank=True, null=True)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="units")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ItemUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="units")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="item_units")
    conversion_rate = models.FloatField(default=1.0)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class FolderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="folder_items")
    unit = models.CharField(max_length=50)
    quantity = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("folder", "item")


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    address = models.TextField(blank=True, null=True)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="customers")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name or ''}".strip()


class EventType(models.TextChoices):
    SELL = "SELL", "Sell"
    BUY = "BUY", "Buy"
    MOVE = "MOVE", "Move"


class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=10, choices=EventType.choices)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="events")
    origin_folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        related_name="origin_events",
        blank=True,
        null=True,
    )
    destination_folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        related_name="destination_events",
        blank=True,
        null=True,
    )
    folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        related_name="folder_events",
        blank=True,
        null=True,
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        related_name="events",
        blank=True,
        null=True,
    )
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class EventItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="event_items")
    item = models.ForeignKey(Item, on_delete=models.SET_NULL, related_name="event_items", blank=True, null=True)
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=255, blank=True, null=True)
    barcode = models.CharField(max_length=255, blank=True, null=True)
    quantity = models.FloatField()
    unit = models.CharField(max_length=50, blank=True, null=True)
    value = models.FloatField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

from django.contrib import admin

from .models import (
    Business,
    Customer,
    Event,
    EventItem,
    Folder,
    FolderItem,
    Item,
    ItemImage,
    ItemUnit,
    Otp,
    Unit,
)


admin.site.register(Business)
admin.site.register(Otp)
admin.site.register(Folder)
admin.site.register(Item)
admin.site.register(ItemImage)
admin.site.register(Unit)
admin.site.register(ItemUnit)
admin.site.register(FolderItem)
admin.site.register(Customer)
admin.site.register(Event)
admin.site.register(EventItem)

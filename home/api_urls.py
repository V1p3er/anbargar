from django.urls import path

from . import views


urlpatterns = [
    path("auth/register/", views.api_register, name="api_register"),
    path("auth/login/", views.api_login, name="api_login"),
    path("auth/session-token/", views.api_session_token, name="api_session_token"),
    path("otp/send/", views.api_send_otp, name="api_send_otp"),
    path("otp/verify/", views.api_verify_otp, name="api_verify_otp"),
    path("dashboard/stats/", views.api_dashboard_stats, name="api_dashboard_stats"),
    path("folders/", views.api_folders, name="api_folders"),
    path("folders/<uuid:folder_id>/", views.api_folder_detail, name="api_folder_detail"),
    path("items/", views.api_items, name="api_items"),
    path("items/<uuid:item_id>/", views.api_item_detail, name="api_item_detail"),
    path("units/", views.api_units, name="api_units"),
    path("units/<uuid:unit_id>/", views.api_unit_detail, name="api_unit_detail"),
    path("customers/", views.api_customers, name="api_customers"),
    path("customers/<uuid:customer_id>/", views.api_customer_detail, name="api_customer_detail"),
    path("events/", views.api_events, name="api_events"),
    path("events/<uuid:event_id>/", views.api_event_detail, name="api_event_detail"),
    path("inventory/", views.api_inventory, name="api_inventory"),
    path("upload/", views.api_upload, name="api_upload"),
    path("ai/predict-stockout/", views.api_ai_predict_stockout, name="api_ai_predict_stockout"),
]

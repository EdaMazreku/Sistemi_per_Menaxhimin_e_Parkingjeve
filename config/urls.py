from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

from parking.views import parking_list_page

urlpatterns = [
    path(
        "",
        TemplateView.as_view(template_name="parking/home.html"),
        name="home",
    ),

    path(
        "login/",
        TemplateView.as_view(template_name="parking/login.html"),
        name="login",
    ),

    path(
        "register/",
        TemplateView.as_view(template_name="parking/register.html"),
        name="register",
    ),

    path(
        "reservations/",
        TemplateView.as_view(template_name="parking/reservations.html"),
        name="reservations",
    ),

    path(
        "dashboard/",
        TemplateView.as_view(template_name="parking/dashboard.html"),
        name="dashboard",
    ),

    path(
        "parking/",
        parking_list_page,
        name="parking-list",
    ),

    path(
        "payments/",
        TemplateView.as_view(template_name="parking/payments.html"),
        name="payments",
    ),

    path(
        "admin-dashboard/",
        TemplateView.as_view(template_name="parking/admin/dashboard.html"),
        name="admin-dashboard",
    ),

    path(
        "admin-dashboard/parking-lots/",
        TemplateView.as_view(template_name="parking/admin/parking-lots.html"),
        name="admin-parking-lots",
    ),

    path(
        "admin-dashboard/parking-spaces/",
        TemplateView.as_view(template_name="parking/admin/parking-spaces.html"),
        name="admin-parking-spaces",
    ),

    path(
        "admin-dashboard/reservations/",
        TemplateView.as_view(template_name="parking/admin/reservations.html"),
        name="admin-reservations",
    ),

    path(
        "admin-dashboard/payments/",
        TemplateView.as_view(template_name="parking/admin/payments.html"),
        name="admin-payments",
    ),
    
    path(
        "admin-dashboard/users/",
        TemplateView.as_view(template_name="parking/admin/users.html"),
        name="admin-users",
    ),

    path('admin/', admin.site.urls),
    path("api/", include("parking.urls")),
]

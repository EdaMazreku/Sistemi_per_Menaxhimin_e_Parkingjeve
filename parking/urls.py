from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ParkingLotViewSet,
    ParkingSpaceViewSet,
    ReservationViewSet,
    PaymentViewSet,
    LoginView,
    RegisterView,
    AdminCheckView,
    AdminUserCountView,
    AdminUserListView,
    AdminUserManagementListView,
)

router = DefaultRouter()

router.register(
    r"parking-lots",
    ParkingLotViewSet,
    basename="parking-lot",
)
router.register(
    r"parking-spaces",
    ParkingSpaceViewSet,
    basename="parking-space",
)
router.register(
    r"reservations",
    ReservationViewSet,
    basename="reservation",
)
router.register(
    r"payments",
    PaymentViewSet,
    basename="payment",
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="api-login"),
    path("register/", RegisterView.as_view(), name="api-register"),
    path("admin-check/", AdminCheckView.as_view(), name="admin-check"),
    path("admin-user-count/", AdminUserCountView.as_view(), name="admin-user-count",),
    path("", include(router.urls)),
    path("admin-users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("admin-users-management/", AdminUserManagementListView.as_view(), name="admin-user-management-list"),
    path("admin-users-management/<int:pk>/", AdminUserManagementListView.as_view(), name="admin-user-management-detail"),
]


from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ParkingLotViewSet,
    ParkingSpaceViewSet,
    ReservationViewSet,
    PaymentViewSet,
    LoginView,
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
    path("", include(router.urls)),
]

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    ParkingLot,
    ParkingSpace,
    Reservation,
    Payment,
)

User = get_user_model()

class ParkingTestSetup(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="TestPassword123!",
        )

        self.other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="OtherPassword123!",
        )

        self.parking_lot = ParkingLot.objects.create(
            name="Parking Test",
            address="Prishtine",
            description="Parking për testim",
            capacity=5,
            opening_time="06:00",
            closing_time="23:00",
            is_active=True,
        )

        self.parking_space = ParkingSpace.objects.create(
            parking_lot=self.parking_lot,
            space_number="A01",
            space_type=ParkingSpace.SpaceType.STANDARD,
            status=ParkingSpace.SpaceStatus.AVAILABLE,
        )

        self.future_start = timezone.now() + timedelta(days=1)
        self.future_end = self.future_start + timedelta(hours=2)

        self.reservation = Reservation.objects.create(
            user=self.user,
            parking_space=self.parking_space,
            start_time=self.future_start,
            end_time=self.future_end,
        )

        self.client.force_authenticate(user=self.user)

class ParkingCapacityTests(ParkingTestSetup):

    def setUp(self):
        super().setUp()

        self.admin_user = User.objects.create_superuser(
            username="capacity_admin",
            email="capacity_admin@example.com",
            password="AdminPassword123!",
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_admin_can_create_space_when_capacity_available(self):
        url = reverse("parking-space-list")

        response = self.client.post(
            url,
            {
                "parking_lot": self.parking_lot.id,
                "space_number": "A02",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        self.assertEqual(
            self.parking_lot.spaces.count(),
            2,
        )

    def test_admin_cannot_create_space_when_capacity_reached(self):
        self.parking_lot.capacity = 1
        self.parking_lot.save(update_fields=["capacity"])

        url = reverse("parking-space-list")

        response = self.client.post(
            url,
            {
                "parking_lot": self.parking_lot.id,
                "space_number": "A02",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertEqual(
            self.parking_lot.spaces.count(),
            1,
        )

    def test_admin_can_update_existing_space_at_full_capacity(self):
        self.parking_lot.capacity = 1
        self.parking_lot.save(update_fields=["capacity"])

        url = reverse(
            "parking-space-detail",
            args=[self.parking_space.id],
        )

        response = self.client.patch(
            url,
            {"status": ParkingSpace.SpaceStatus.OCCUPIED},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

    def test_admin_cannot_reduce_capacity_below_existing_spaces(self):
        ParkingSpace.objects.create(
            parking_lot=self.parking_lot,
            space_number="A02",
        )

        ParkingSpace.objects.create(
            parking_lot=self.parking_lot,
            space_number="A03",
        )

        url = reverse(
            "parking-lot-detail",
            args=[self.parking_lot.id],
        )

        response = self.client.patch(
            url,
            {"capacity": 2},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.parking_lot.refresh_from_db()

        self.assertEqual(
            self.parking_lot.capacity,
            5,
        )

    def test_admin_can_increase_capacity(self):
        url = reverse(
            "parking-lot-detail",
            args=[self.parking_lot.id],
        )

        response = self.client.patch(
            url,
            {"capacity": 10},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.parking_lot.refresh_from_db()

        self.assertEqual(
            self.parking_lot.capacity,
            10,
        )

class ReservationTests(ParkingTestSetup):

    def test_user_can_cancel_future_reservation(self):
        url = reverse(
            "reservation-detail",
            args=[self.reservation.id],
        )

        response = self.client.patch(
            url,
            {"status": Reservation.ReservationStatus.CANCELLED},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.reservation.refresh_from_db()

        self.assertEqual(
            self.reservation.status,
            Reservation.ReservationStatus.CANCELLED,
        )

    def test_user_cannot_cancel_started_reservation(self):
        self.reservation.start_time = timezone.now() - timedelta(minutes=10)
        self.reservation.end_time = timezone.now() + timedelta(hours=1)
        self.reservation.save()

        url = reverse(
            "reservation-detail",
            args=[self.reservation.id],
        )

        response = self.client.patch(
            url,
            {"status": Reservation.ReservationStatus.CANCELLED},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.reservation.refresh_from_db()

        self.assertNotEqual(
            self.reservation.status,
            Reservation.ReservationStatus.CANCELLED,
        )

    def test_user_cannot_cancel_other_users_reservation(self):
        other_reservation = Reservation.objects.create(
            user=self.other_user,
            parking_space=self.parking_space,
            start_time=self.future_start + timedelta(hours=3),
            end_time=self.future_end + timedelta(hours=3),
        )

        url = reverse(
            "reservation-detail",
            args=[other_reservation.id],
        )

        response = self.client.patch(
            url,
            {"status": Reservation.ReservationStatus.CANCELLED},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_overlapping_reservation_is_rejected(self):
        url = reverse("reservation-list")

        response = self.client.post(
            url,
            {
                "parking_space": self.parking_space.id,
                "start_time": (
                    self.future_start + timedelta(minutes=30)
                ).isoformat(),
                "end_time": (
                    self.future_end + timedelta(minutes=30)
                ).isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_user_can_reserve_same_space_on_different_dates(self):
        url = reverse("reservation-list")

        new_start = self.future_start + timedelta(days=2)
        new_end = new_start + timedelta(hours=2)

        response = self.client.post(
            url,
            {
                "parking_space": self.parking_space.id,
                "start_time": new_start.isoformat(),
                "end_time": new_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

    def test_admin_can_update_reservation_time_without_conflict(self):
        admin_user = User.objects.create_superuser(
            username="reservation_admin",
            email="reservation_admin@example.com",
            password="AdminPassword123!",
        )

        self.client.force_authenticate(user=admin_user)

        new_start = self.future_start + timedelta(days=2)
        new_end = new_start + timedelta(hours=2)

        url = reverse(
            "reservation-detail",
            args=[self.reservation.id],
        )

        response = self.client.put(
            url,
            {
                "parking_space": self.parking_space.id,
                "start_time": new_start.isoformat(),
                "end_time": new_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.reservation.refresh_from_db()

        self.assertEqual(self.reservation.start_time, new_start)
        self.assertEqual(self.reservation.end_time, new_end)

    def test_admin_cannot_update_reservation_to_overlapping_time(self):
        admin_user = User.objects.create_superuser(
            username="reservation_admin2",
            email="reservation_admin2@example.com",
            password="AdminPassword123!",
        )

        other_reservation = Reservation.objects.create(
            user=self.other_user,
            parking_space=self.parking_space,
            start_time=self.future_start + timedelta(hours=3),
            end_time=self.future_end + timedelta(hours=3),
        )

        self.client.force_authenticate(user=admin_user)

        url = reverse(
            "reservation-detail",
            args=[self.reservation.id],
        )

        response = self.client.put(
            url,
            {
                "parking_space": self.parking_space.id,
                "start_time": (
                    other_reservation.start_time
                    + timedelta(minutes=30)
                ).isoformat(),
                "end_time": (
                    other_reservation.end_time
                    + timedelta(minutes=30)
                ).isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.reservation.refresh_from_db()

        self.assertEqual(
            self.reservation.start_time,
            self.future_start,
        )

    def test_admin_can_move_reservation_to_another_available_space(self):
        admin_user = User.objects.create_superuser(
            username="reservation_admin3",
            email="reservation_admin3@example.com",
            password="AdminPassword123!",
        )

        another_space = ParkingSpace.objects.create(
            parking_lot=self.parking_lot,
            space_number="A02",
            space_type=ParkingSpace.SpaceType.STANDARD,
            status=ParkingSpace.SpaceStatus.AVAILABLE,
        )

        self.client.force_authenticate(user=admin_user)

        url = reverse(
            "reservation-detail",
            args=[self.reservation.id],
        )

        response = self.client.put(
            url,
            {
                "parking_space": another_space.id,
                "start_time": self.future_start.isoformat(),
                "end_time": self.future_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.reservation.refresh_from_db()

        self.assertEqual(
            self.reservation.parking_space_id,
            another_space.id,
        )

class PaymentTests(ParkingTestSetup):

    def create_payment(self, reservation, payment_status):
        return Payment.objects.create(
            reservation=reservation,
            amount=Decimal("2.00"),
            payment_method=Payment.PaymentMethod.CASH,
            status=payment_status,
        )

    def test_user_can_create_payment(self):
        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        payment = Payment.objects.get(
            reservation=self.reservation,
        )

        self.assertEqual(
            payment.status,
            Payment.PaymentStatus.PENDING,
        )

        self.assertEqual(
            payment.amount,
            Decimal("2.00"),
        )

    def test_pending_payment_blocks_new_payment(self):
        self.create_payment(
            self.reservation,
            Payment.PaymentStatus.PENDING,
        )

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_paid_payment_blocks_new_payment(self):
        payment = self.create_payment(
            self.reservation,
            Payment.PaymentStatus.PAID,
        )

        payment.payment_date = timezone.now()
        payment.save(update_fields=["payment_date"])

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_failed_payment_allows_new_payment(self):
        self.create_payment(
            self.reservation,
            Payment.PaymentStatus.FAILED,
        )

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

    def test_refunded_payment_allows_new_payment(self):
        self.create_payment(
            self.reservation,
            Payment.PaymentStatus.REFUNDED,
        )

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

    def test_user_cannot_pay_for_another_users_reservation(self):
        other_reservation = Reservation.objects.create(
            user=self.other_user,
            parking_space=self.parking_space,
            start_time=self.future_start + timedelta(hours=3),
            end_time=self.future_end + timedelta(hours=3),
        )

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": other_reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_user_cannot_pay_for_cancelled_reservation(self):
        self.reservation.status = Reservation.ReservationStatus.CANCELLED
        self.reservation.save(update_fields=["status"])

        url = reverse("payment-list")

        response = self.client.post(
            url,
            {
                "reservation": self.reservation.id,
                "payment_method": Payment.PaymentMethod.CASH,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_user_cannot_change_payment_status(self):
        payment = self.create_payment(
            self.reservation,
            Payment.PaymentStatus.PENDING,
        )

        url = reverse("payment-detail", args=[payment.id])

        response = self.client.patch(
            url,
            {"status": Payment.PaymentStatus.PAID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

        payment.refresh_from_db()

        self.assertEqual(
            payment.status,
            Payment.PaymentStatus.PENDING,
        )

    def test_admin_can_mark_payment_as_paid(self):
        admin_user = User.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="AdminPassword123!",
        )

        payment = self.create_payment(
            self.reservation,
            Payment.PaymentStatus.PENDING,
        )

        self.client.force_authenticate(user=admin_user)

        url = reverse("payment-detail", args=[payment.id])

        response = self.client.patch(
            url,
            {"status": Payment.PaymentStatus.PAID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        payment.refresh_from_db()

        self.assertEqual(
            payment.status,
            Payment.PaymentStatus.PAID,
        )

        self.assertIsNotNone(payment.payment_date)

    def test_admin_cannot_make_invalid_payment_status_transition(self):
        admin_user = User.objects.create_superuser(
            username="admin2",
            email="admin2@example.com",
            password="AdminPassword123!",
        )

        payment = self.create_payment(
            self.reservation,
            Payment.PaymentStatus.FAILED,
        )

        self.client.force_authenticate(user=admin_user)

        url = reverse("payment-detail", args=[payment.id])

        response = self.client.patch(
            url,
            {"status": Payment.PaymentStatus.PAID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        payment.refresh_from_db()

        self.assertEqual(
            payment.status,
            Payment.PaymentStatus.FAILED,
        )

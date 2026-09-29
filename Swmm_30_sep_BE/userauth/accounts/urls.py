from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("token/", views.TokenObtainV2View.as_view(), name="token-obtain"),
    path("token/access/", views.AccessTokenView.as_view(), name="token-access"),
    path("token/refresh/", views.LiveTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path(
        "change-password/", views.ChangePasswordView.as_view(), name="change-password"
    ),
    path("signup/", views.SignupView.as_view(), name="signup"),
    path("me/", views.MeView.as_view(), name="me"),
    path("me/sessions/", views.MySessionsView.as_view(), name="me-sessions"),
    path("approval/", views.ApprovalQueueView.as_view(), name="approval-queue"),
    path(
        "users/",
        views.UserListAPIView.as_view(),
        name="user-list-api",
    ),
    path(
        "users/<int:user_id>/",
        views.EditUserProfileAPIView.as_view(),
        name="edit-user-profile-api",
    ),
    path(
        "approval/<int:profile_id>/<str:action>/",
        views.ApprovalActionView.as_view(),
        name="approval-action",
    ),
]

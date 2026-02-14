from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'employees', views.EmployeeViewSet, basename='employee')
router.register(r'attendance', views.AttendanceViewSet, basename='attendance')
router.register(r'salary', views.SalaryViewSet, basename='salary')
router.register(r'adjustments', views.AdjustmentViewSet, basename='adjustment')
router.register(r'rewards', views.PerformanceRewardViewSet, basename='reward')
router.register(r'holidays', views.HolidayViewSet, basename='holiday')
router.register(r'settings', views.SystemSettingViewSet, basename='setting')

urlpatterns = [
    path('auth/login/', views.AdminLoginView.as_view()),
    path('admins/<int:pk>/', views.AdminProfileView.as_view()),
    path('upload/employees/', views.UploadEmployeesView.as_view()),
    path('upload/attendance/', views.UploadAttendanceView.as_view()),
    path('upload/shift/', views.UploadShiftView.as_view()),
    path('upload/force-punch/', views.UploadForcePunchView.as_view()),
    path('dashboard/', views.DashboardView.as_view()),
    path('salary/monthly/', views.SalaryMonthlyView.as_view()),
    path('leaderboard/', views.LeaderboardView.as_view()),
    path('absentee-alert/', views.AbsenteeAlertView.as_view()),
    path('attendance/adjust/', views.AttendanceAdjustView.as_view()),
    path('reward-engine/run/', views.RunRewardEngineView.as_view()),
    path('leaderboard/bonus/', views.GiveBonusView.as_view()),
    path('bonus/overview/', views.BonusOverviewView.as_view()),
    path('bonus/set/', views.SetBonusView.as_view()),
    path('export/payroll-excel/', views.ExportPayrollExcelView.as_view()),
    path('export/', views.ExportView.as_view()),
    path('employees/<str:emp_code>/profile/', views.EmployeeProfileView.as_view()),
    path('', include(router.urls)),
]

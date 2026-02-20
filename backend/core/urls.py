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
    path('departments/', views.DepartmentsListView.as_view()),
    path('admins/', views.AdminListView.as_view()),
    path('admins/<int:pk>/', views.AdminProfileView.as_view()),
    path('admins/<int:pk>/access/', views.AdminUpdateAccessView.as_view()),
    path('audit-log/', views.AuditLogListView.as_view()),
    path('upload/employees/', views.UploadEmployeesView.as_view()),
    path('upload/attendance/', views.UploadAttendanceView.as_view()),
    path('upload/shift/', views.UploadShiftView.as_view()),
    path('upload/force-punch/', views.UploadForcePunchView.as_view()),
    path('dashboard/', views.DashboardView.as_view()),
    path('salary/monthly/', views.SalaryMonthlyView.as_view()),
    path('advance/', views.SalaryAdvanceListCreateView.as_view()),
    path('advance/<int:pk>/', views.SalaryAdvanceDetailView.as_view()),
    path('leaderboard/', views.LeaderboardView.as_view()),
    path('absentee-alert/', views.AbsenteeAlertView.as_view()),
    path('attendance/adjust/', views.AttendanceAdjustView.as_view()),
    path('penalty/', views.PenaltyListView.as_view()),
    path('penalty/create/', views.PenaltyCreateView.as_view()),
    path('penalty/<int:pk>/', views.PenaltyDetailView.as_view()),
    path('reward-engine/run/', views.RunRewardEngineView.as_view()),
    path('settings/smtp/', views.EmailSmtpConfigView.as_view()),
    path('settings/google-sheet/', views.GoogleSheetConfigView.as_view()),
    path('settings/google-sheet/sync/', views.GoogleSheetSyncView.as_view()),
    path('settings/plant-report-email/', views.PlantReportEmailConfigView.as_view()),
    path('settings/plant-report-email/send-now/', views.PlantReportEmailSendNowView.as_view()),
    path('settings/plant-report-email/recipients/', views.PlantReportRecipientListCreateView.as_view()),
    path('settings/plant-report-email/recipients/<int:pk>/', views.PlantReportRecipientDetailView.as_view()),
    path('leaderboard/bonus/', views.GiveBonusView.as_view()),
    path('bonus/overview/', views.BonusOverviewView.as_view()),
    path('bonus/employee-details/', views.BonusEmployeeDetailsView.as_view()),
    path('bonus/set/', views.SetBonusView.as_view()),
    path('bonus/hide-grant/', views.HideBonusGrantView.as_view()),
    path('export/payroll-excel/', views.ExportPayrollExcelView.as_view()),
    path('export/employee-salary-history/', views.ExportEmployeeSalaryHistoryView.as_view()),
    path('export/', views.ExportView.as_view()),
    path('employees/<str:emp_code>/profile/', views.EmployeeProfileView.as_view()),
    path('', include(router.urls)),
]

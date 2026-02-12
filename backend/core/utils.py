"""
Utility: normalize Excel column names for flexible matching.
Handles *, /, and case variations (e.g. "Name*", "Date*", "Emp Id" vs "emp id").
"""
import re


def normalize_column_name(s):
    if s is None or not isinstance(s, str):
        return ""
    # Strip, lowercase, remove * / and trailing dots, extra spaces
    s = str(s).strip().lower()
    s = re.sub(r'[\*\/]+', '', s)
    s = s.rstrip('.')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# Expected normalized names for attendance sheet (Emp Id, emp_id, code = same)
ATTENDANCE_COLUMN_ALIASES = {
    'emp id': ['emp id', 'empid', 'emp_id', 'emp_code', 'code', 'employee id', 'employee code'],
    'name': ['name', 'emp name', 'employee name'],
    'dept': ['dept', 'dept.', 'department', 'dept name', 'department name'],
    'designation': ['designation', 'designation name'],
    'date': ['date', 'attendance date', 'work date'],
    'day': ['day', 'day name'],
    'punch in': ['punch in', 'punchin', 'in time', 'check in'],
    'punch out': ['punch out', 'punchout', 'out time', 'check out'],
    'total working hours': ['total working hours', 'working hours', 'total hours', 'work hours'],
    'total break': ['total break', 'break', 'break hours'],
    'status': ['status', 'attendance status', 'day status'],
    'over_time': ['over_time', 'overtime', 'over time', 'ot hours'],
}

# Expected normalized names for employee sheet (code, emp id, emp_id = same)
EMPLOYEE_COLUMN_ALIASES = {
    'code': ['code', 'emp code', 'emp_code', 'empid', 'emp id', 'emp_id', 'employee id', 'employee code'],
    'name': ['name', 'emp name', 'employee name'],
    'mobile no': ['mobile no', 'mobile', 'phone', 'mobile number', 'contact'],
    'email': ['email', 'email id', 'email address'],
    'gender': ['gender', 'sex'],
    'department name': ['department name', 'department', 'dept', 'dept name'],
    'designation name': ['designation name', 'designation', 'designation name'],
    'status': ['status', 'employee status'],
    'employment type': ['employment type', 'employment type', 'emp type', 'type'],
    'salary type': ['salary type', 'salary type', 'pay type'],
    'salary': ['salary', 'base salary', 'basic salary', 'monthly salary', 'hourly rate'],
}


def map_columns_to_schema(df_columns, alias_dict):
    """
    Given list of column names from DataFrame, return dict: schema_key -> actual column name.
    schema_key is the key from alias_dict (e.g. 'emp id', 'name').
    """
    normalized_to_original = {}
    for col in df_columns:
        norm = normalize_column_name(col)
        if norm:
            normalized_to_original[norm] = col

    result = {}
    for schema_key, aliases in alias_dict.items():
        for alias in aliases:
            if alias in normalized_to_original:
                result[schema_key] = normalized_to_original[alias]
                break
    return result

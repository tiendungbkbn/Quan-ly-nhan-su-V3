import json
import os

def json_to_sql(table_name, file_name):
    if not os.path.exists(file_name):
        return f"-- Bỏ qua {file_name} (Không tìm thấy)\n"

    with open(file_name, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sql = f"-- Dữ liệu bảng {table_name}\n"
    for item in data:
        keys = []
        vals = []
        for k, v in item.items():
            keys.append(k)
            if v is None:
                vals.append("NULL")
            elif isinstance(v, str):
                v = v.replace("'", "''") # Tránh lỗi dấu nháy đơn trong chuỗi
                vals.append(f"'{v}'")
            else:
                vals.append(f"'{v}'")
        sql += f"INSERT INTO {table_name} ({', '.join(keys)}) VALUES ({', '.join(vals)});\n"
    return sql + "\n"

final_sql = ""
final_sql += json_to_sql('employees', 'employees.json')
final_sql += json_to_sql('documents', 'documents.json')
final_sql += json_to_sql('document_history', 'document_history.json')
final_sql += json_to_sql('docx_templates', 'docx_templates.json')

with open('dulieu_chuan.sql', 'w', encoding='utf-8') as f:
    f.write(final_sql)

print("HOÀN TẤT! Hãy tìm file dulieu_chuan.sql vừa được tạo ra ở cột bên trái.")
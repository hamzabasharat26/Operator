import mysql.connector

conn = mysql.connector.connect(
    host='localhost',
    user='root',
    password='',
    database='magicqc'
)
cur = conn.cursor()

# Check measurements for NKE-TS-001 article
cur.execute("""
    SELECT a.article_style, m.id as measurement_id, m.measurement as measurement_name, ms.size, ms.value as target_value
    FROM articles a 
    JOIN measurements m ON a.id = m.article_id 
    JOIN measurement_sizes ms ON m.id = ms.measurement_id 
    WHERE a.article_style = 'NKE-TS-001'
    ORDER BY m.id, ms.size
""")

print("Measurements for NKE-TS-001:")
for row in cur.fetchall():
    print(f"  Measurement {row[1]}: {row[2]} | Size {row[3]} = {row[4]} cm")

print("\n" + "="*60)

# Check article_annotations for NKE-TS-001
cur.execute("""
    SELECT article_style, size, keypoints_pixels, image_width, image_height
    FROM article_annotations
    WHERE article_style = 'NKE-TS-001'
""")

print("\nNKE-TS-001 Annotations:")
for row in cur.fetchall():
    print(f"  Size {row[1]}: keypoints={row[2]}")
    print(f"  Image dimensions: {row[3]}x{row[4]}")

conn.close()

import json

# Load both files
with open('testjson/annotation_data.json', 'r') as f:
    test = json.load(f)
    
with open('temp_annotations/ADD-TS-001_S.json', 'r') as f:
    db = json.load(f)

print('=' * 70)
print('KEYPOINT COMPARISON: testjson vs Database')
print('=' * 70)
print()
print(f'Testjson has {len(test["keypoints"])} keypoints')
print(f'DB has {len(db["keypoints"])} keypoints')
print()

# Analyze keypoint positions
print('Index | Testjson (x, y)     | Database (x, y)     | Match?')
print('-' * 70)

for i in range(max(len(test['keypoints']), len(db['keypoints']))):
    test_pt = test['keypoints'][i] if i < len(test['keypoints']) else None
    db_pt = db['keypoints'][i] if i < len(db['keypoints']) else None
    
    if test_pt and db_pt:
        # Check if points are close (within 200px)
        dist = ((test_pt[0] - db_pt[0])**2 + (test_pt[1] - db_pt[1])**2)**0.5
        match = 'YES' if dist < 200 else 'NO'
        print(f'{i:5} | ({test_pt[0]:4}, {test_pt[1]:4})     | ({db_pt[0]:4}, {db_pt[1]:4})     | {match} ({dist:.0f}px)')
    elif test_pt:
        print(f'{i:5} | ({test_pt[0]:4}, {test_pt[1]:4})     | MISSING              | -')
    elif db_pt:
        print(f'{i:5} | MISSING              | ({db_pt[0]:4}, {db_pt[1]:4})     | -')

print()
print('=' * 70)
print('KEYPOINT SEMANTICS ANALYSIS')
print('=' * 70)

# In a typical t-shirt annotation, keypoints would represent specific locations
# like shoulder, armhole, hem, etc. The order matters for measurements.
# Let's analyze if the point positions suggest different ordering

print('\nTestjson keypoint locations (sorted by y):')
test_sorted = sorted(enumerate(test['keypoints']), key=lambda x: x[1][1])
for idx, (orig_idx, pt) in enumerate(test_sorted[:5]):
    print(f'  Top {idx+1}: Point {orig_idx} at ({pt[0]}, {pt[1]})')

print('\nDatabase keypoint locations (sorted by y):')
db_sorted = sorted(enumerate(db['keypoints']), key=lambda x: x[1][1])
for idx, (orig_idx, pt) in enumerate(db_sorted[:5]):
    print(f'  Top {idx+1}: Point {orig_idx} at ({pt[0]}, {pt[1]})')

print()
print('=' * 70)
print('ROOT CAUSE ANALYSIS')
print('=' * 70)
print()
print('The measurement system expects keypoints in a SPECIFIC ORDER:')
print('  - Measurement 1: distance between keypoints[0] and keypoints[1]')
print('  - Measurement 2: distance between keypoints[2] and keypoints[3]')
print('  - etc.')
print()
print('If the database annotation has keypoints in a DIFFERENT ORDER')
print('than the test annotation, measurements will be calculated')
print('between the WRONG pairs of points!')

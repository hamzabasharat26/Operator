"""
Test script to run measurment2.py directly with testjson files.
This bypasses the UI and API to test if the measurement system works correctly.
"""
import os
import sys
from measurment2 import LiveKeypointDistanceMeasurer

def main():
    print("=" * 60)
    print("[TEST] DIRECT MEASUREMENT TEST WITH testjson FILES")
    print("=" * 60)
    
    # Create measurer instance
    measurer = LiveKeypointDistanceMeasurer()
    
    # Set paths to testjson files
    testjson_dir = os.path.join(os.path.dirname(__file__), 'testjson')
    
    measurer.annotation_file = os.path.join(testjson_dir, 'annotation_data.json')
    measurer.reference_image_file = os.path.join(testjson_dir, 'reference_image.jpg')
    
    print(f"[PATH] Annotation file: {measurer.annotation_file}")
    print(f"[PATH] Reference image: {measurer.reference_image_file}")
    print(f"[PATH] File exists: annotation={os.path.exists(measurer.annotation_file)}, image={os.path.exists(measurer.reference_image_file)}")
    
    # Initialize camera
    print("\n[INIT] Initializing camera...")
    if not measurer.initialize_camera():
        print("[ERR] Failed to initialize camera!")
        return
    
    # Load calibration
    print("\n[CAL] Loading calibration...")
    if not measurer.load_calibration():
        print("[WARN] No calibration found. Measurements will be in pixels only.")
    else:
        print(f"[CAL] Calibration loaded: {measurer.pixels_per_cm:.2f} px/cm")
    
    # Load annotation
    print("\n[ANN] Loading annotation...")
    if not measurer.load_annotation():
        print("[ERR] Failed to load annotation!")
        return
    
    print(f"[ANN] Loaded {len(measurer.keypoints)} keypoints")
    print(f"[ANN] Loaded {len(measurer.target_distances)} target distances")
    if measurer.reference_image is not None:
        print(f"[DIM] Reference image: {measurer.reference_image.shape[1]}x{measurer.reference_image.shape[0]}")
    if measurer.reference_gray is not None:
        print(f"[DIM] Reference gray: {measurer.reference_gray.shape}")
    
    # Start live measurement
    print("\n[LIVE] Starting live measurement...")
    print("[INFO] This should work the same as working_measuring.py")
    try:
        measurer.transfer_keypoints_to_live()
    except KeyboardInterrupt:
        print("\n[EXIT] Interrupted by user")
    finally:
        if measurer.camera_obj:
            measurer.camera_obj.close()
        print("[EXIT] Camera closed")

if __name__ == "__main__":
    main()

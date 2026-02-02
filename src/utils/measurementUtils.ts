/**
 * Measurement utility functions
 */

/**
 * Evaluates if a measured value passes the tolerance check
 * @param measuredValue - The actual measured value entered by operator
 * @param expectedValue - The expected value from the spec
 * @param tolPlus - Positive tolerance (added to expected value)
 * @param tolMinus - Negative tolerance (subtracted from expected value)
 * @returns 'PASS' if within tolerance, 'FAIL' otherwise
 */
export function evaluateMeasurement(
    measuredValue: number | null,
    expectedValue: number,
    tolPlus: number,
    tolMinus: number
): 'PASS' | 'FAIL' | 'PENDING' {
    if (measuredValue === null || isNaN(measuredValue)) {
        return 'PENDING'
    }

    const lowerBound = expectedValue - Math.abs(tolMinus)
    const upperBound = expectedValue + Math.abs(tolPlus)

    return measuredValue >= lowerBound && measuredValue <= upperBound ? 'PASS' : 'FAIL'
}

/**
 * Checks if all measurements have been completed
 * @param measuredValues - Object mapping measurement IDs to their values
 * @param measurementCount - Total number of measurements expected
 * @returns true if all measurements have values
 */
export function allMeasurementsComplete(
    measuredValues: Record<number, number | null>,
    measurementCount: number
): boolean {
    const values = Object.values(measuredValues)
    if (values.length !== measurementCount) return false
    return values.every(v => v !== null && !isNaN(v))
}

/**
 * Formats a decimal value for display
 * @param value - The numeric value
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted string
 */
export function formatMeasurementValue(value: number | null, decimals: number = 2): string {
    if (value === null) return '-'
    return value.toFixed(decimals)
}

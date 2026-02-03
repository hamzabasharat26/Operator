import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import type {
  ArticleWithRelations,
  MeasurementSpec,
  JobCardSummary,
  PurchaseOrderArticle,
  Brand
} from '../types/database'

interface ArticleType {
  id: number
  name: string
}

interface PurchaseOrder {
  id: number
  po_number: string
  brand_id: number
  country: string
}

interface POArticle extends PurchaseOrderArticle {
  po_number: string
  brand_name: string
  article_type_name: string
  country: string
}

export function ArticlesList() {
  // Basic states
  const [error, setError] = useState<string | null>(null)

  // Selection states
  const [brands, setBrands] = useState<Brand[]>([])
  const [articleTypes, setArticleTypes] = useState<ArticleType[]>([])
  const [articles, setArticles] = useState<ArticleWithRelations[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [poArticles, setPOArticles] = useState<POArticle[]>([])

  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null)
  const [selectedArticleTypeId, setSelectedArticleTypeId] = useState<number | null>(null)
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null)
  const [selectedPOArticleId, setSelectedPOArticleId] = useState<number | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null) // Nothing selected initially

  // Available sizes - loaded dynamically from database based on article
  const [availableSizes, setAvailableSizes] = useState<string[]>([])

  // Job Card Summary
  const [jobCardSummary, setJobCardSummary] = useState<JobCardSummary | null>(null)

  // Measurement states
  const [measurementSpecs, setMeasurementSpecs] = useState<MeasurementSpec[]>([])
  const [measuredValues, setMeasuredValues] = useState<Record<number, string>>({})
  const [isMeasurementEnabled, setIsMeasurementEnabled] = useState(false)

  // Live measurement lifecycle states
  const [isPollingActive, setIsPollingActive] = useState(false)
  const [measurementComplete, setMeasurementComplete] = useState(false)
  const [editableTols, setEditableTols] = useState<Record<number, { tol_plus: string; tol_minus: string }>>({})

  // Current PO articles for navigation
  const [currentPOArticleIndex, setCurrentPOArticleIndex] = useState(0)

  // Saving state
  const [isSaving, setIsSaving] = useState(false)

  // Calibration state
  const [calibrationStatus, setCalibrationStatus] = useState<{
    calibrated: boolean
    pixels_per_cm?: number
    calibration_date?: string
  } | null>(null)
  const [isCalibrating, setIsCalibrating] = useState(false)

  const { operator } = useAuth()

  // Fetch brands on mount
  useEffect(() => {
    fetchBrands()
    // Don't fetch article types on mount - wait for brand selection

    // DIAGNOSTIC: Check database state on mount
    const runDiagnostics = async () => {
      console.log('====== DATABASE DIAGNOSTICS ======')

      // Check articles
      const articlesResult = await window.database.query<any>(
        `SELECT a.id, a.article_style, a.brand_id, a.article_type_id, b.name as brand, at.name as article_type
         FROM articles a
         LEFT JOIN brands b ON a.brand_id = b.id
         LEFT JOIN article_types at ON a.article_type_id = at.id`
      )
      console.log('[DIAG] Articles:', articlesResult.data)

      // Check measurements
      const measurementsResult = await window.database.query<any>(
        `SELECT m.id, m.code, m.measurement, m.article_id, a.article_style
         FROM measurements m
         LEFT JOIN articles a ON m.article_id = a.id`
      )
      console.log('[DIAG] Measurements:', measurementsResult.data)

      // Check measurement sizes
      const sizesResult = await window.database.query<any>(
        `SELECT ms.measurement_id, ms.size, ms.value, m.code
         FROM measurement_sizes ms
         LEFT JOIN measurements m ON ms.measurement_id = m.id
         LIMIT 30`
      )
      console.log('[DIAG] Measurement Sizes (first 30):', sizesResult.data)

      // Check purchase orders
      const posResult = await window.database.query<any>(
        `SELECT po.id, po.po_number, po.brand_id, b.name as brand
         FROM purchase_orders po
         LEFT JOIN brands b ON po.brand_id = b.id`
      )
      console.log('[DIAG] Purchase Orders:', posResult.data)

      // Check PO articles
      const poArticlesResult = await window.database.query<any>(
        `SELECT poa.id, poa.purchase_order_id, poa.article_style, poa.article_type_id, at.name as article_type
         FROM purchase_order_articles poa
         LEFT JOIN article_types at ON poa.article_type_id = at.id`
      )
      console.log('[DIAG] PO Articles:', poArticlesResult.data)

      console.log('====== END DIAGNOSTICS ======')
    }

    runDiagnostics()
  }, [])

  // Fetch article types when brand changes
  useEffect(() => {
    if (selectedBrandId) {
      fetchArticleTypes() // Filtered by brand
    } else {
      setArticleTypes([])
      setArticles([])
    }
  }, [selectedBrandId])

  // Fetch articles when brand or article type changes
  useEffect(() => {
    if (selectedBrandId) {
      fetchArticles() // Filtered by brand AND article type if selected
    } else {
      setArticles([])
    }
  }, [selectedBrandId, selectedArticleTypeId])

  // Fetch POs when article is selected - filter to POs that contain this article style
  useEffect(() => {
    if (selectedBrandId && selectedArticleId) {
      fetchPurchaseOrdersForArticle()
    } else if (selectedBrandId) {
      // If no article selected, show all POs for brand
      fetchPurchaseOrders()
    } else {
      setPurchaseOrders([])
    }
  }, [selectedBrandId, selectedArticleId])

  // Update job card summary when selections change
  useEffect(() => {
    updateJobCardSummary()
  }, [selectedPOId, selectedBrandId, selectedArticleId, selectedArticleTypeId])

  // Load PO articles when PO is selected
  useEffect(() => {
    if (selectedPOId) {
      fetchPOArticles()

    } else {
      setPOArticles([])

      setIsMeasurementEnabled(false)
    }
  }, [selectedPOId])

  // Load measurement specs when article and size change (direct article selection)
  useEffect(() => {
    // Only run if we have a selected article and size, but no PO article yet
    // This allows measurements to show as soon as article + size is selected
    if (selectedArticleId && selectedSize && !selectedPOArticleId) {
      console.log('[EFFECT] Article + Size changed, loading measurements directly')
      loadMeasurementsDirectlyFromArticle(selectedArticleId, selectedSize)
    }
  }, [selectedArticleId, selectedSize])

  // Load measurement specs when PO article and size change (PO-based selection)
  useEffect(() => {
    if (selectedPOArticleId && selectedSize) {
      // If we have selectedArticleId, use it directly (more reliable)
      if (selectedArticleId) {
        console.log('[EFFECT] PO Article selected but using direct article ID for measurements')
        loadMeasurementsDirectlyFromArticle(selectedArticleId, selectedSize)
      } else {
        console.log('[EFFECT] PO Article selected, using fetchMeasurementSpecs')
        fetchMeasurementSpecs()
      }
    } else if (!selectedArticleId) {
      // Only clear if we don't have a direct article selection
      setMeasurementSpecs([])
      setMeasuredValues({})
    }
  }, [selectedPOArticleId, selectedSize])

  // Auto-save logic during live measurement (Industry 4.0 Persistence)
  useEffect(() => {
    if (isPollingActive && Object.keys(measuredValues).length > 0) {
      const handler = setTimeout(() => {
        saveMeasurements()
      }, 2000) // Debounce save every 2 seconds during live flow
      return () => clearTimeout(handler)
    }
  }, [measuredValues, isPollingActive])

  // Poll for live results when polling is active
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>

    if (isPollingActive && measurementSpecs.length > 0) {
      console.log('[POLLING] Starting live measurement polling...')
      console.log('[POLLING] Measurement specs:', measurementSpecs.map((s, idx) => ({
        index: idx,
        specId: s.id,
        code: s.code
      })))

      intervalId = setInterval(async () => {
        try {
          const result = await window.measurement.getLiveResults()

          if (result.status === 'success' && result.data && result.data.measurements) {
            const liveData = result.data.measurements as Array<{
              id: number
              name: string
              actual_cm: number
              qc_passed: boolean
            }>

            console.log('[POLLING] Received', liveData.length, 'live measurements, is_live:', result.data.is_live)

            setMeasuredValues(prev => {
              const newValues = { ...prev }
              let updated = false

              // Match live measurements to specs by their position
              // Live measurement id=1 corresponds to first spec (index 0)
              // Live measurement id=2 corresponds to second spec (index 1)
              // etc.
              liveData.forEach((liveMeasurement) => {
                // Use liveMeasurement.id - 1 as the index into measurementSpecs
                const specIndex = liveMeasurement.id - 1

                if (specIndex >= 0 && specIndex < measurementSpecs.length) {
                  const spec = measurementSpecs[specIndex]
                  const newValue = liveMeasurement.actual_cm.toFixed(2)

                  if (newValues[spec.id] !== newValue) {
                    console.log(`[POLLING] Spec[${specIndex}] ${spec.code} (id=${spec.id}): ${prev[spec.id] || 'empty'} -> ${newValue} cm`)
                    newValues[spec.id] = newValue
                    updated = true
                  }
                }
              })

              if (updated) {
                console.log('[POLLING] Updated values:', Object.keys(newValues).length, 'measurements')
              }
              return updated ? newValues : prev
            })
          } else if (result.status === 'success' && !result.data) {
            console.log('[POLLING] No live measurements available yet')
          } else {
            console.log('[POLLING] API returned:', result.status, result.message)
          }
        } catch (err) {
          console.error('[POLLING] Error:', err)
        }
      }, 500) // Poll every 500ms for smooth updates
    }

    return () => {
      if (intervalId) {
        console.log('[POLLING] Stopping live measurement polling')
        clearInterval(intervalId)
      }
    }
  }, [isPollingActive, measurementSpecs])

  const fetchBrands = async () => {
    try {
      const result = await window.database.query<Brand>(
        'SELECT id, name FROM brands ORDER BY name'
      )
      if (result.success && result.data) {
        setBrands(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch brands:', err)
    }
  }

  const fetchArticleTypes = async () => {
    if (!selectedBrandId) {
      setArticleTypes([])
      return
    }
    try {
      // Only fetch article types that have articles for the selected brand
      const sql = `
        SELECT DISTINCT at.id, at.name
        FROM article_types at
        JOIN articles a ON a.article_type_id = at.id
        WHERE a.brand_id = ?
        ORDER BY at.name
      `
      const result = await window.database.query<ArticleType>(sql, [selectedBrandId])
      if (result.success && result.data) {
        setArticleTypes(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch article types:', err)
    }
  }

  const fetchArticles = async () => {
    try {
      // Filter by both brand AND article type if article type is selected
      let sql: string
      let params: any[]

      if (selectedArticleTypeId) {
        sql = `
          SELECT 
            a.*,
            b.name as brand_name,
            at.name as article_type_name
          FROM articles a
          LEFT JOIN brands b ON a.brand_id = b.id
          LEFT JOIN article_types at ON a.article_type_id = at.id
          WHERE a.brand_id = ? AND a.article_type_id = ?
          ORDER BY a.article_style
        `
        params = [selectedBrandId, selectedArticleTypeId]
      } else {
        sql = `
          SELECT 
            a.*,
            b.name as brand_name,
            at.name as article_type_name
          FROM articles a
          LEFT JOIN brands b ON a.brand_id = b.id
          LEFT JOIN article_types at ON a.article_type_id = at.id
          WHERE a.brand_id = ?
          ORDER BY a.article_style
        `
        params = [selectedBrandId]
      }

      const result = await window.database.query<ArticleWithRelations>(sql, params)
      if (result.success && result.data) {
        setArticles(result.data)
        console.log('[ARTICLES] Loaded', result.data.length, 'articles for brand:', selectedBrandId, 'type:', selectedArticleTypeId)
      }
    } catch (err) {
      console.error('Failed to fetch articles:', err)
    }
  }

  const fetchPurchaseOrders = async () => {
    try {
      const sql = `
        SELECT DISTINCT po.id, po.po_number, po.brand_id, po.country
        FROM purchase_orders po
        WHERE po.brand_id = ? AND po.status = 'Active'
        ORDER BY po.po_number
      `
      const result = await window.database.query<PurchaseOrder>(sql, [selectedBrandId])
      if (result.success && result.data) {
        setPurchaseOrders(result.data)
        console.log('[PO] Loaded', result.data.length, 'POs for brand:', selectedBrandId)
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err)
    }
  }

  // Fetch POs that are linked to the selected article via purchase_order_articles
  const fetchPurchaseOrdersForArticle = async () => {
    if (!selectedArticleId || !selectedBrandId) return

    try {
      // Get the selected article's details
      const article = articles.find(a => a.id === selectedArticleId)
      if (!article) {
        console.log('[PO_ARTICLE] Article not found in state:', selectedArticleId)
        return
      }

      console.log('[PO_ARTICLE] Finding POs for article:', article.article_style, 'type:', article.article_type_id)

      // Find POs that have this article style and type in their purchase_order_articles
      const sql = `
        SELECT DISTINCT po.id, po.po_number, po.brand_id, po.country
        FROM purchase_orders po
        JOIN purchase_order_articles poa ON poa.purchase_order_id = po.id
        WHERE po.brand_id = ? 
          AND po.status = 'Active'
          AND poa.article_type_id = ?
          AND poa.article_style = ?
        ORDER BY po.po_number
      `
      const result = await window.database.query<PurchaseOrder>(sql, [
        selectedBrandId,
        article.article_type_id,
        article.article_style
      ])

      if (result.success && result.data) {
        console.log('[PO_ARTICLE] Found', result.data.length, 'POs linked to article:', article.article_style)
        setPurchaseOrders(result.data)

        // Auto-select if only one PO exists for this article
        if (result.data.length === 1) {
          console.log('[PO_ARTICLE] Auto-selecting single PO:', result.data[0].po_number)
          setSelectedPOId(result.data[0].id)
        } else if (result.data.length === 0) {
          // Fallback: show all POs for the brand if none linked to specific article
          console.log('[PO_ARTICLE] No POs linked to article, falling back to brand POs')
          fetchPurchaseOrders()
        }
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders for article:', err)
      // Fallback to brand-level POs
      fetchPurchaseOrders()
    }
  }

  // Fetch available sizes for the current article from measurement_sizes table
  const fetchAvailableSizes = async (articleId: number) => {
    try {
      const sql = `
        SELECT DISTINCT ms.size
        FROM measurement_sizes ms
        JOIN measurements m ON ms.measurement_id = m.id
        WHERE m.article_id = ?
        ORDER BY FIELD(ms.size, 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL')
      `
      const result = await window.database.query<{ size: string }>(sql, [articleId])
      if (result.success && result.data && result.data.length > 0) {
        const sizes = result.data.map(r => r.size)
        console.log('[SIZES] Loaded available sizes:', sizes)
        setAvailableSizes(sizes)
        // Don't auto-select - let user choose
        // If currently selected size is not valid, clear it
        if (selectedSize && !sizes.includes(selectedSize)) {
          setSelectedSize(null)
        }
      } else {
        // No sizes found - clear available sizes
        setAvailableSizes([])
        setSelectedSize(null)
      }
    } catch (err) {
      console.error('Failed to fetch available sizes:', err)
      setAvailableSizes([])
    }
  }

  const updateJobCardSummary = () => {
    // Build job card from current selections
    const brand = brands.find(b => b.id === selectedBrandId)
    const article = articles.find(a => a.id === selectedArticleId)
    const articleType = articleTypes.find(at => at.id === selectedArticleTypeId)
    const po = purchaseOrders.find(p => p.id === selectedPOId)

    if (brand || article || po) {
      setJobCardSummary({
        po_number: po?.po_number || '',
        brand_name: brand?.name || '',
        article_type_name: articleType?.name || article?.article_type_name || '',
        country: po?.country || '',
        article_description: article?.description || null,
        article_style: article?.article_style || ''
      })
    } else {
      setJobCardSummary(null)
    }
  }

  const fetchPOArticles = async () => {
    if (!selectedPOId) return
    try {
      console.log('[PO_ARTICLES] Fetching for PO ID:', selectedPOId)
      const sql = `
        SELECT 
          poa.*,
          po.po_number,
          po.brand_id,
          b.name as brand_name,
          at.name as article_type_name,
          po.country
        FROM purchase_order_articles poa
        JOIN purchase_orders po ON poa.purchase_order_id = po.id
        LEFT JOIN brands b ON po.brand_id = b.id
        LEFT JOIN article_types at ON poa.article_type_id = at.id
        WHERE poa.purchase_order_id = ?
        ORDER BY poa.article_style
      `
      const result = await window.database.query<POArticle & { brand_id: number }>(sql, [selectedPOId])
      console.log('[PO_ARTICLES] Query result:', result.data)
      if (result.success && result.data) {
        setPOArticles(result.data)
        if (result.data.length > 0) {
          console.log('[PO_ARTICLES] First PO Article:', {
            id: result.data[0].id,
            article_style: result.data[0].article_style,
            article_type_id: result.data[0].article_type_id
          })
          const firstPOArticleId = result.data[0].id
          setSelectedPOArticleId(firstPOArticleId)
          setCurrentPOArticleIndex(0)

          // CRITICAL: Directly query measurements for this PO article
          // Only fetch if a size is selected
          if (selectedSize) {
            console.log('[PO_ARTICLES] Triggering immediate measurement fetch for article:', firstPOArticleId)
            await fetchMeasurementSpecsForArticle(firstPOArticleId, selectedSize)
          } else {
            console.log('[PO_ARTICLES] No size selected yet, waiting for user to select size')
          }
        }
      }
    } catch (err) {
      console.error('[PO_ARTICLES] Failed to fetch PO articles:', err)
    }
  }

  // Main function that accepts explicit parameters - doesn't rely on state
  // Uses the directly selected article ID when available for accurate measurement loading
  const fetchMeasurementSpecsForArticle = async (poArticleId: number, size: string) => {
    if (!poArticleId || !size) {
      console.log('[SPECS] Missing required parameters:', { poArticleId, size })
      setMeasurementSpecs([])
      return
    }

    try {
      console.log('[SPECS] ========== MEASUREMENT FETCH ==========')
      console.log('[SPECS] PO Article ID:', poArticleId, 'Size:', size)
      console.log('[SPECS] Selected Article ID from state:', selectedArticleId)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any = { success: false, data: [] }

      // STRATEGY 1: If we have a directly selected article ID (from the dropdown), use it directly
      // This is the most reliable method since user already selected the exact article
      if (selectedArticleId) {
        console.log('[SPECS] Using directly selected article ID:', selectedArticleId)
        const directQuery = `
          SELECT 
            m.id,
            m.code,
            m.measurement,
            COALESCE(m.tol_plus, 0) as tol_plus,
            COALESCE(m.tol_minus, 0) as tol_minus,
            ms.size,
            ms.value as expected_value,
            COALESCE(ms.unit, 'cm') as unit,
            a.id as article_id
          FROM articles a
          JOIN measurements m ON m.article_id = a.id
          JOIN measurement_sizes ms ON ms.measurement_id = m.id
          WHERE a.id = ? AND UPPER(TRIM(ms.size)) = UPPER(TRIM(?))
          ORDER BY m.code
        `
        result = await window.database.query<MeasurementSpec & { article_id?: number }>(directQuery, [selectedArticleId, size])
        console.log('[SPECS] Direct article query result:', result.data?.length || 0, 'measurements')

        if (result.data && result.data.length > 0) {
          // Load available sizes for this article
          fetchAvailableSizes(selectedArticleId)
        }
      }

      // STRATEGY 2: Match through PO article using brand + type + style
      if (!result.data || result.data.length === 0) {
        console.log('[SPECS] Trying PO article match: brand_id + article_type_id + article_style...')
        const comprehensiveQuery = `
          SELECT 
            m.id,
            m.code,
            m.measurement,
            COALESCE(m.tol_plus, 0) as tol_plus,
            COALESCE(m.tol_minus, 0) as tol_minus,
            ms.size,
            ms.value as expected_value,
            COALESCE(ms.unit, 'cm') as unit,
            a.id as article_id
          FROM purchase_order_articles poa
          JOIN purchase_orders po ON poa.purchase_order_id = po.id
          JOIN articles a ON a.brand_id = po.brand_id 
                        AND a.article_type_id = poa.article_type_id
                        AND a.article_style = poa.article_style
          JOIN measurements m ON m.article_id = a.id
          JOIN measurement_sizes ms ON ms.measurement_id = m.id
          WHERE poa.id = ? AND UPPER(TRIM(ms.size)) = UPPER(TRIM(?))
          ORDER BY m.code
        `
        result = await window.database.query<MeasurementSpec & { article_id?: number }>(comprehensiveQuery, [poArticleId, size])
        console.log('[SPECS] PO article match result:', result.data?.length || 0, 'measurements')

        if (result.data && result.data.length > 0 && result.data[0].article_id) {
          fetchAvailableSizes(result.data[0].article_id)
        }
      }

      // STRATEGY 3: Match by brand + type only (style might differ slightly)
      if (!result.data || result.data.length === 0) {
        console.log('[SPECS] Trying fallback: brand_id + article_type_id match...')
        const fallback1Query = `
          SELECT 
            m.id,
            m.code,
            m.measurement,
            COALESCE(m.tol_plus, 0) as tol_plus,
            COALESCE(m.tol_minus, 0) as tol_minus,
            ms.size,
            ms.value as expected_value,
            COALESCE(ms.unit, 'cm') as unit,
            a.id as article_id
          FROM purchase_order_articles poa
          JOIN purchase_orders po ON poa.purchase_order_id = po.id
          JOIN articles a ON a.brand_id = po.brand_id AND a.article_type_id = poa.article_type_id
          JOIN measurements m ON m.article_id = a.id
          JOIN measurement_sizes ms ON ms.measurement_id = m.id
          WHERE poa.id = ? AND UPPER(TRIM(ms.size)) = UPPER(TRIM(?))
          ORDER BY m.code
          LIMIT 50
        `
        result = await window.database.query<MeasurementSpec & { article_id?: number }>(fallback1Query, [poArticleId, size])
        console.log('[SPECS] Fallback 1 result:', result.data?.length || 0, 'measurements')

        if (result.data && result.data.length > 0 && result.data[0].article_id) {
          fetchAvailableSizes(result.data[0].article_id)
        }
      }

      // STRATEGY 4: Match by article_type_id only
      if (!result.data || result.data.length === 0) {
        console.log('[SPECS] Trying fallback: article_type_id only...')
        const fallback2Query = `
          SELECT 
            m.id,
            m.code,
            m.measurement,
            COALESCE(m.tol_plus, 0) as tol_plus,
            COALESCE(m.tol_minus, 0) as tol_minus,
            ms.size,
            ms.value as expected_value,
            COALESCE(ms.unit, 'cm') as unit,
            a.id as article_id
          FROM purchase_order_articles poa
          JOIN articles a ON a.article_type_id = poa.article_type_id
          JOIN measurements m ON m.article_id = a.id
          JOIN measurement_sizes ms ON ms.measurement_id = m.id
          WHERE poa.id = ? AND UPPER(TRIM(ms.size)) = UPPER(TRIM(?))
          ORDER BY m.code
          LIMIT 50
        `
        result = await window.database.query<MeasurementSpec & { article_id?: number }>(fallback2Query, [poArticleId, size])
        console.log('[SPECS] Fallback 2 result:', result.data?.length || 0, 'measurements')

        if (result.data && result.data.length > 0 && result.data[0].article_id) {
          fetchAvailableSizes(result.data[0].article_id)
        }
      }

      // Process results
      if (result.success && result.data && result.data.length > 0) {
        console.log('[SPECS] ✓ SUCCESS! Loaded', result.data.length, 'measurements:', result.data.map((m: MeasurementSpec) => m.code).join(', '))
        setMeasurementSpecs(result.data)
        const initialValues: Record<number, string> = {}
        result.data.forEach((spec: MeasurementSpec) => {
          initialValues[spec.id] = ''
        })
        setMeasuredValues(initialValues)
        loadExistingMeasurements(result.data)
      } else {
        console.log('[SPECS] ✗ No measurements found for any query strategy')
        setMeasurementSpecs([])
        setMeasuredValues({})
      }
    } catch (err) {
      console.error('[SPECS] ✗ FATAL ERROR:', err)
      setMeasurementSpecs([])
    }
  }

  // Wrapper function that uses current state values
  const fetchMeasurementSpecs = async () => {
    if (!selectedPOArticleId || !selectedSize) {
      console.log('[SPECS] Wrapper: Missing state values:', { selectedPOArticleId, selectedSize })
      return
    }
    await fetchMeasurementSpecsForArticle(selectedPOArticleId, selectedSize)
  }

  const handleMeasuredValueChange = (measurementId: number, value: string) => {
    // Allow empty, numbers, and decimal points
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return
    setMeasuredValues(prev => ({
      ...prev,
      [measurementId]: value
    }))
  }

  // Increment/decrement handlers for numeric inputs
  const handleMeasuredValueStep = (measurementId: number, delta: number) => {
    setMeasuredValues(prev => {
      const current = parseFloat(prev[measurementId] || '0') || 0
      const newValue = Math.max(0, current + delta)
      return {
        ...prev,
        [measurementId]: newValue.toFixed(2)
      }
    })
  }


  const handleToleranceStep = (specId: number, field: 'tol_plus' | 'tol_minus', delta: number) => {
    setEditableTols(prev => {
      const current = parseFloat(prev[specId]?.[field] || '0') || 0
      const newValue = Math.max(0, current + delta)
      return {
        ...prev,
        [specId]: {
          ...prev[specId],
          [field]: newValue.toFixed(2)
        }
      }
    })
  }

  // Direct status calculation - called inline to ensure fresh values
  const calculateStatus = (spec: MeasurementSpec): 'PASS' | 'FAIL' | 'PENDING' => {
    const valueStr = measuredValues[spec.id]
    if (!valueStr || valueStr === '') return 'PENDING'
    const value = parseFloat(valueStr)
    if (isNaN(value)) return 'PENDING'

    // Use editable tolerances if available, otherwise use spec defaults
    const tols = editableTols[spec.id]
    const tolPlus = tols ? (parseFloat(tols.tol_plus) || spec.tol_plus) : spec.tol_plus
    const tolMinus = tols ? (parseFloat(tols.tol_minus) || spec.tol_minus) : spec.tol_minus

    const minValid = spec.expected_value - tolMinus
    const maxValid = spec.expected_value + tolPlus

    return (value >= minValid && value <= maxValid) ? 'PASS' : 'FAIL'
  }

  const handleToleranceChange = (specId: number, field: 'tol_plus' | 'tol_minus', value: string) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return
    setEditableTols(prev => ({
      ...prev,
      [specId]: {
        ...prev[specId],
        [field]: value
      }
    }))
  }

  const handleStartMeasurement = async () => {
    try {
      // Reset state for new measurement session
      setMeasurementComplete(false)

      // Initialize editable tolerances from specs
      const tols: Record<number, { tol_plus: string; tol_minus: string }> = {}
      measurementSpecs.forEach(spec => {
        tols[spec.id] = {
          tol_plus: spec.tol_plus.toString(),
          tol_minus: spec.tol_minus.toString()
        }
      })
      setEditableTols(tols)

      // Ensure a size is selected before starting
      if (!selectedSize) {
        setError('Please select a size before starting measurement')
        return
      }

      // Get article style for annotation lookup
      const articleStyle = jobCardSummary?.article_style ||
        articles.find(a => a.id === selectedArticleId)?.article_style

      if (!articleStyle) {
        setError('Article style not found. Please select an article.')
        return
      }

      console.log('[MEASUREMENT] Fetching annotation from uploaded_annotations for:', articleStyle, 'size:', selectedSize)

      // ============== NEW: Fetch from uploaded_annotations table ==============
      const annotationResult = await window.database.query<{
        id: number
        article_id: number
        article_style: string
        size: string
        name: string
        annotation_data: string  // JSON string
        image_width: number
        image_height: number
      }>(
        `SELECT id, article_id, article_style, size, name, annotation_data, image_width, image_height
         FROM uploaded_annotations 
         WHERE article_style = ? AND size = ?`,
        [articleStyle, selectedSize]
      )

      console.log('[MEASUREMENT] Database query result:', annotationResult)

      if (!annotationResult.success) {
        console.error('[MEASUREMENT] Database query failed:', annotationResult.error)
        setError(`Database error: ${annotationResult.error || 'Unknown error'}`)
        return
      }

      if (!annotationResult.data || annotationResult.data.length === 0) {
        console.log('[MEASUREMENT] No annotation found in uploaded_annotations table')
        setError(`No uploaded annotation found for ${articleStyle} size ${selectedSize}. Please upload annotation via the web dashboard.`)
        return
      }

      const dbAnnotation = annotationResult.data[0]
      console.log('[MEASUREMENT] Found uploaded annotation:', dbAnnotation.name, 'ID:', dbAnnotation.id)
      console.log('[MEASUREMENT] Image dimensions:', dbAnnotation.image_width, 'x', dbAnnotation.image_height)

      // Parse annotation_data JSON - use 'any' because format varies
      let annotationData: {
        keypoints: any  // Can be string, array of objects, or array of arrays
        target_distances?: Record<string, number> | string
        placement_box?: any  // Can be string or object
      }

      try {
        annotationData = typeof dbAnnotation.annotation_data === 'string'
          ? JSON.parse(dbAnnotation.annotation_data)
          : dbAnnotation.annotation_data
      } catch (e) {
        console.error('[MEASUREMENT] Failed to parse annotation_data:', e)
        setError('Failed to parse annotation data. Please re-upload the annotation.')
        return
      }

      console.log('[MEASUREMENT] Parsed annotation_data:', annotationData)
      console.log('[MEASUREMENT] Keypoints type:', typeof annotationData.keypoints)
      console.log('[MEASUREMENT] Keypoints sample:', JSON.stringify(annotationData.keypoints?.slice?.(0, 2)))
      console.log('[MEASUREMENT] Placement box:', annotationData.placement_box)

      // Parse keypoints - handle multiple formats
      let keypointsPixels: number[][] = []

      if (annotationData.keypoints) {
        if (typeof annotationData.keypoints === 'string') {
          // Format: "x1 y1 x2 y2 ..." or "[[x1,y1],[x2,y2],...]" 
          const kpStr = annotationData.keypoints.trim()
          if (kpStr.startsWith('[')) {
            // JSON string
            const parsed = JSON.parse(kpStr)
            keypointsPixels = parsed.map((kp: any) =>
              Array.isArray(kp) ? [Number(kp[0]), Number(kp[1])] : [Number(kp.x), Number(kp.y)]
            )
          } else {
            // Space-separated: "x1 y1 x2 y2 ..."
            const nums = kpStr.split(/\s+/).map(Number)
            for (let i = 0; i < nums.length - 1; i += 2) {
              keypointsPixels.push([nums[i], nums[i + 1]])
            }
          }
        } else if (Array.isArray(annotationData.keypoints)) {
          // Array format - could be [{x,y}] or [[x,y]]
          keypointsPixels = annotationData.keypoints.map((kp: any) => {
            if (Array.isArray(kp)) {
              return [Number(kp[0]), Number(kp[1])]
            } else if (typeof kp === 'object' && kp !== null) {
              return [Number(kp.x), Number(kp.y)]
            }
            return [0, 0]
          })
        }
      }

      console.log('[MEASUREMENT] Converted keypoints:', keypointsPixels.length, 'points')
      console.log('[MEASUREMENT] First 3 keypoints:', keypointsPixels.slice(0, 3))

      // Validate keypoints
      if (keypointsPixels.length < 2) {
        setError(`Insufficient keypoints (${keypointsPixels.length}). Need at least 2 points for measurement.`)
        return
      }

      // Parse placement_box - handle multiple formats
      let placementBox: number[] | null = null
      if (annotationData.placement_box) {
        const pb = annotationData.placement_box
        if (typeof pb === 'string') {
          // Format: "x1 y1 x2 y2" or "x y width height"
          const nums = pb.trim().split(/\s+/).map(Number)
          if (nums.length >= 4) {
            placementBox = nums.slice(0, 4)
          }
          console.log('[MEASUREMENT] Parsed placement_box from string:', placementBox)
        } else if (typeof pb === 'object' && pb !== null) {
          if ('width' in pb && 'height' in pb) {
            // Format: {x, y, width, height}
            placementBox = [pb.x, pb.y, pb.x + pb.width, pb.y + pb.height]
          } else if (Array.isArray(pb)) {
            // Format: [x1, y1, x2, y2]
            placementBox = pb.map(Number)
          }
          console.log('[MEASUREMENT] Parsed placement_box from object:', placementBox)
        }
      }

      // ============== Fetch target_distances from measurements table ==============
      let targetDistances: Record<string, number> = {}

      // Get measurements from database (same logic as before)
      const articleResult = await window.database.query<{ id: number }>(
        `SELECT id FROM articles WHERE article_style = ? LIMIT 1`,
        [articleStyle]
      )

      if (articleResult.success && articleResult.data && articleResult.data.length > 0) {
        const articleId = articleResult.data[0].id

        const measurementsResult = await window.database.query<{
          measurement_id: number,
          measurement_name: string,
          target_value: number
        }>(
          `SELECT m.id as measurement_id, m.measurement as measurement_name, ms.value as target_value
           FROM measurements m 
           JOIN measurement_sizes ms ON m.id = ms.measurement_id 
           WHERE m.article_id = ? AND ms.size = ?
           ORDER BY m.id`,
          [articleId, selectedSize]
        )

        if (measurementsResult.success && measurementsResult.data && measurementsResult.data.length > 0) {
          measurementsResult.data.forEach((m, index) => {
            targetDistances[String(index + 1)] = Number(m.target_value)
          })
          console.log('[MEASUREMENT] Got target_distances from measurements table:', targetDistances)
        } else {
          // Fallback to annotation_data.target_distances if available
          const td = annotationData.target_distances
          if (typeof td === 'string') {
            try { targetDistances = JSON.parse(td) } catch { targetDistances = {} }
          } else {
            targetDistances = td || {}
          }
          console.log('[MEASUREMENT] Using annotation target_distances:', targetDistances)
        }
      } else {
        const td = annotationData.target_distances
        if (typeof td === 'string') {
          try { targetDistances = JSON.parse(td) } catch { targetDistances = {} }
        } else {
          targetDistances = td || {}
        }
        console.log('[MEASUREMENT] Article not found, using annotation target_distances:', targetDistances)
      }

      // ============== Fetch reference image from Laravel API via IPC (bypasses CORS) ==============
      console.log('[MEASUREMENT] Fetching reference image via IPC:', articleStyle, selectedSize)

      let imageData: string | null = null
      let imageMimeType = 'image/jpeg'

      try {
        const imageResult = await window.measurement.fetchLaravelImage(articleStyle, selectedSize)

        if (imageResult.status === 'success' && imageResult.data) {
          imageData = imageResult.data // Already includes data:image/...;base64, prefix
          imageMimeType = imageResult.mime_type || 'image/jpeg'
          console.log('[MEASUREMENT] Fetched reference image from Laravel API via IPC')
          console.log('[MEASUREMENT] Image dimensions from API:', imageResult.width, 'x', imageResult.height)
        } else {
          throw new Error(imageResult.message || 'Invalid image response from API')
        }
      } catch (err) {
        console.error('[MEASUREMENT] Failed to fetch reference image:', err)
        setError(`Failed to fetch reference image from server: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      // ============== Save files to temp_measure folder ==============
      console.log('[MEASUREMENT] Saving files to temp_measure folder...')

      try {
        const saveResult = await window.measurement.saveTempFiles({
          keypoints: keypointsPixels,
          target_distances: targetDistances,
          placement_box: placementBox,
          image_width: dbAnnotation.image_width,
          image_height: dbAnnotation.image_height,
          image_base64: imageData!
        })

        if (saveResult.status === 'success') {
          console.log('[MEASUREMENT] Files saved to temp_measure:')
          console.log('  - JSON:', saveResult.jsonPath)
          console.log('  - Image:', saveResult.imagePath)
        } else {
          console.error('[MEASUREMENT] Failed to save temp files:', saveResult.message)
        }
      } catch (err) {
        console.error('[MEASUREMENT] Error saving temp files:', err)
        // Continue with measurement even if file saving fails
      }

      // ============== Start measurement with fetched data ==============
      console.log('[MEASUREMENT] Starting measurement with:')
      console.log('  - Keypoints:', keypointsPixels.length)
      console.log('  - Target distances:', Object.keys(targetDistances).length)
      console.log('  - Image dimensions:', dbAnnotation.image_width, 'x', dbAnnotation.image_height)

      const result = await window.measurement.start({
        annotation_name: selectedSize,
        article_style: articleStyle,
        side: 'front',
        keypoints_pixels: JSON.stringify(keypointsPixels),
        target_distances: JSON.stringify(targetDistances),
        placement_box: placementBox ? JSON.stringify(placementBox) : undefined,
        image_width: dbAnnotation.image_width,
        image_height: dbAnnotation.image_height,
        annotation_data: undefined,
        image_data: imageData!,
        image_mime_type: imageMimeType
      })

      if (result.status === 'success') {
        setIsMeasurementEnabled(true)
        setIsPollingActive(true) // Start live polling
        setError(null)
        console.log('[MEASUREMENT] Measurement started successfully!')
      } else {
        setError(result.message || 'Failed to start camera system')
      }
    } catch (err) {
      console.error('Start measurement error:', err)
      setError('Measurement service not responding')
    }
  }

  // TEST ANNOTATION: Start measurement with test annotation file from testjson folder
  const handleTestAnnotationMeasurement = async () => {
    try {
      console.log('[TEST] Starting measurement with TEST ANNOTATION from testjson folder...')

      // Keypoints and target distances from testjson/annotation_test.json
      // These are for the 5488x3672 reference image (matches camera native resolution)
      const TEST_WIDTH = 5488
      const TEST_HEIGHT = 3672

      // Keypoints and target distances from testjson/annotation_data.json (SYNCED!)
      const testKeypoints = [
        [1806, 1318], [1710, 2024], [3395, 1359], [3465, 2045],
        [2280, 1144], [2895, 1173], [1809, 2924], [3308, 2945],
        [2268, 1062], [2225, 3073], [229, 1917], [323, 2135],
        [3410, 1285], [4849, 2061]
      ]

      const testTargetDistances = {
        "1": 20.8524686252755,
        "2": 20.181240578402498,
        "3": 18.019047989259654,
        "4": 43.87601480642671,
        "5": 58.90287103526992,
        "6": 6.9748861675833,
        "7": 47.87395450078443
      }

      const testPlacementBox = [133, 995, 4903, 3197]

      console.log('[TEST] Test annotation:', testKeypoints.length, 'keypoints,', Object.keys(testTargetDistances).length, 'target distances')
      console.log('[TEST] Designed for image dimensions:', TEST_WIDTH, 'x', TEST_HEIGHT)

      // Load reference image from testjson folder via IPC
      let imageData: string | null = null
      const imageMimeType = 'image/jpeg'

      // Request the test image from Electron main process
      const testImageResult = await window.measurement.loadTestImage('testjson/reference_image.jpg')

      if (testImageResult.status === 'success' && testImageResult.data) {
        imageData = testImageResult.data
        console.log('[TEST] Loaded test reference image from testjson/reference_image.jpg')
        console.log('[TEST] Image base64 length:', imageData.length)
      } else {
        console.log('[TEST] Could not load test image:', testImageResult.message)
        console.log('[TEST] Falling back to database image...')

        // Fallback: try to get image from database (if any article is selected)
        const articleStyle = jobCardSummary?.article_style ||
          articles.find(a => a.id === selectedArticleId)?.article_style

        if (articleStyle && selectedSize) {
          const imageResult = await window.database.query<{
            image_data: string
            image_mime_type: string
          }>(
            `SELECT image_data, image_mime_type FROM article_annotations WHERE article_style = ? AND size = ? LIMIT 1`,
            [articleStyle, selectedSize]
          )
          if (imageResult.success && imageResult.data && imageResult.data.length > 0 && imageResult.data[0].image_data) {
            imageData = imageResult.data[0].image_data
            console.log('[TEST] Using fallback reference image from database')
            console.log('[TEST] WARNING: Database image dimensions may not match test annotation!')
          }
        }
      }

      if (!imageData) {
        setError('Could not load test reference image. Ensure testjson/reference_image.jpg exists.')
        return
      }

      // Start measurement with test annotation and test image
      // Since test image is 5488x3672 (same as camera), live frame will resize to match
      const result = await window.measurement.start({
        annotation_name: 'TEST',
        article_style: 'TEST-ANNOTATION',
        side: 'front',
        keypoints_pixels: JSON.stringify(testKeypoints),
        target_distances: JSON.stringify(testTargetDistances),
        placement_box: JSON.stringify(testPlacementBox),
        image_width: TEST_WIDTH,
        image_height: TEST_HEIGHT,
        annotation_data: undefined,
        image_data: imageData,
        image_mime_type: imageMimeType
      })

      if (result.status === 'success') {
        setIsMeasurementEnabled(true)
        setIsPollingActive(true)
        setError(null)
        console.log('[TEST] Test annotation measurement started successfully!')
        console.log('[TEST] Using', testKeypoints.length, 'keypoints for', TEST_WIDTH, 'x', TEST_HEIGHT, 'image')
        console.log('[TEST] Live frame will be resized to match reference image dimensions')
      } else {
        setError(result.message || 'Failed to start test measurement')
      }
    } catch (err) {
      console.error('[TEST] Test annotation measurement error:', err)
      setError('Test measurement failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleCompleteMeasurement = async () => {
    try {
      console.log('[COMPLETE] Completing measurement...')

      // Fetch final live measurements before stopping
      const finalResult = await window.measurement.getLiveResults()
      if (finalResult.status === 'success' && finalResult.data && finalResult.data.measurements) {
        const liveData = finalResult.data.measurements as Array<{
          id: number
          actual_cm: number
        }>

        // Update measured values with final readings
        setMeasuredValues(prev => {
          const newValues = { ...prev }
          liveData.forEach((liveMeasurement) => {
            const specIndex = liveMeasurement.id - 1
            const spec = measurementSpecs[specIndex]
            if (spec) {
              newValues[spec.id] = liveMeasurement.actual_cm.toFixed(2)
              console.log(`[COMPLETE] Final value for ${spec.code}: ${liveMeasurement.actual_cm.toFixed(2)} cm`)
            }
          })
          return newValues
        })
      }

      // Stop the camera system
      await window.measurement.stop()
      setIsPollingActive(false)

      // Mark measurement as complete (allows editing and shows status)
      setMeasurementComplete(true)
      setIsMeasurementEnabled(false)

      // Final save with all current values
      await saveMeasurements()

      console.log('[COMPLETE] Measurement completed and saved')
      setError(null)
    } catch (err) {
      console.error('Complete measurement error:', err)
      setError('Failed to complete measurement')
    }
  }

  const saveMeasurements = async (): Promise<boolean> => {
    if (!selectedPOArticleId || !selectedSize) {
      console.log('[SAVE] Missing PO article ID or size')
      return false
    }

    setIsSaving(true)
    console.log('[SAVE] Saving measurements for PO Article:', selectedPOArticleId, 'Size:', selectedSize)

    try {
      let savedCount = 0
      for (const spec of measurementSpecs) {
        const valueStr = measuredValues[spec.id]
        const value = valueStr ? parseFloat(valueStr) : null
        const status = calculateStatus(spec)

        const sql = `
          INSERT INTO measurement_results 
            (purchase_order_article_id, measurement_id, size, measured_value, status, operator_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            measured_value = VALUES(measured_value),
            status = VALUES(status),
            operator_id = VALUES(operator_id),
            updated_at = CURRENT_TIMESTAMP
        `
        await window.database.execute(sql, [
          selectedPOArticleId,
          spec.id,
          selectedSize,
          value,
          status,
          operator?.id || null
        ])
        savedCount++
        console.log(`[SAVE] Saved ${spec.code}: value=${value}, status=${status}`)
      }

      console.log(`[SAVE] Successfully saved ${savedCount} measurements`)
      return true
    } catch (err) {
      console.error('[SAVE] Failed to save measurements:', err)
      setError('Failed to save measurements')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleNextArticle = async () => {
    const allComplete = measurementSpecs.every(spec => {
      const valueStr = measuredValues[spec.id]
      return valueStr && valueStr !== ''
    })

    if (!allComplete) {
      setError('Please complete all measurements before proceeding')
      return
    }

    // Stop any active measurement process
    if (isPollingActive) {
      try {
        await window.measurement.stop()
      } catch (err) {
        console.error('Failed to stop measurement:', err)
      }
    }

    const saved = await saveMeasurements()
    if (!saved) return

    // Reset all lifecycle states but keep operator session active
    setIsPollingActive(false)
    setMeasurementComplete(false)
    setIsMeasurementEnabled(false)
    setEditableTols({})

    if (currentPOArticleIndex < poArticles.length - 1) {
      // Move to next article in same PO
      const nextIndex = currentPOArticleIndex + 1
      const nextArticle = poArticles[nextIndex]

      setCurrentPOArticleIndex(nextIndex)
      setSelectedPOArticleId(nextArticle.id)
      setMeasuredValues({})
      setError(null)

      console.log('[NEXT] Moving to next PO article:', nextArticle.article_style)

      // Check if this article already has measurements
      await loadExistingMeasurements(nextArticle.id)
    } else {
      // Last article in PO - offer to select new article or finish
      console.log('[NEXT] Completed all articles in PO, resetting for new selection')
      handleResetForNewArticle()
    }
  }

  // Reset the entire page state for selecting a new article while keeping operator session
  const handleResetForNewArticle = () => {
    console.log('[RESET] Resetting ALL selections for new article')

    // Stop any active measurement
    if (isPollingActive) {
      window.measurement.stop().catch(console.error)
    }

    // Reset ALL selection states
    setSelectedBrandId(null)
    setSelectedArticleTypeId(null)
    setSelectedArticleId(null)
    setSelectedPOId(null)
    setSelectedPOArticleId(null)
    setSelectedSize(null)

    // Reset lists
    setArticleTypes([])
    setArticles([])
    setPurchaseOrders([])
    setPOArticles([])
    setAvailableSizes([])
    setCurrentPOArticleIndex(0)

    // Reset job card
    setJobCardSummary(null)

    // Reset measurement states
    setMeasurementSpecs([])
    setMeasuredValues({})
    setEditableTols({})

    // Reset lifecycle states
    setIsPollingActive(false)
    setMeasurementComplete(false)
    setIsMeasurementEnabled(false)

    // Clear errors
    setError(null)

    // Notify user
    console.log('[RESET] ALL selections cleared - Ready for new article selection')
  }

  const handlePreviousArticle = async () => {
    console.log('[BACK] Going to previous article...')

    // Stop any active measurement
    if (isPollingActive) {
      try {
        await window.measurement.stop()
      } catch (err) {
        console.error('Failed to stop measurement:', err)
      }
    }

    // Save current measurements before navigating
    const saved = await saveMeasurements()
    console.log('[BACK] Current measurements saved:', saved)

    // Reset lifecycle states
    setIsPollingActive(false)
    setMeasurementComplete(false)
    setIsMeasurementEnabled(false)
    setEditableTols({})

    if (currentPOArticleIndex > 0) {
      const prevIndex = currentPOArticleIndex - 1
      const prevArticle = poArticles[prevIndex]

      setCurrentPOArticleIndex(prevIndex)
      setSelectedPOArticleId(prevArticle.id)
      setMeasuredValues({})
      setError(null)

      console.log('[BACK] Navigating to previous article:', prevArticle.article_style)

      // Load existing measurements for the previous article
      await loadExistingMeasurements(prevArticle.id)
    }
  }

  // Load existing measurement results from database
  const loadExistingMeasurements = async (poArticleId: number) => {
    if (!selectedSize) return

    try {
      console.log('[LOAD] Loading existing measurements for PO Article:', poArticleId, 'Size:', selectedSize)

      const sql = `
        SELECT mr.measurement_id, mr.measured_value, mr.status, mr.tol_plus, mr.tol_minus
        FROM measurement_results mr
        WHERE mr.purchase_order_article_id = ?
        AND mr.size = ?
      `
      const result = await window.database.query<{
        measurement_id: number
        measured_value: number | null
        status: string
      }>(sql, [poArticleId, selectedSize])

      if (result.success && result.data && result.data.length > 0) {
        console.log('[LOAD] Found', result.data.length, 'existing measurements')

        // Restore measured values
        const values: Record<number, string> = {}

        result.data.forEach(row => {
          if (row.measured_value !== null) {
            values[row.measurement_id] = row.measured_value.toFixed(2)
          }
        })

        setMeasuredValues(values)

        // Mark as complete if all measurements have values
        const allComplete = measurementSpecs.every(spec => values[spec.id] && values[spec.id] !== '')
        if (allComplete) {
          setMeasurementComplete(true)
          console.log('[LOAD] All measurements complete - marking as finished')
        }
      } else {
        console.log('[LOAD] No existing measurements found')
      }
    } catch (err) {
      console.error('[LOAD] Failed to load existing measurements:', err)
    }
  }

  const handleBack = async () => {
    // Stop any active measurement
    if (isPollingActive) {
      try {
        await window.measurement.stop()
      } catch (err) {
        console.error('Failed to stop measurement:', err)
      }
    }

    // Save before going back
    await saveMeasurements()

    // Reset all states
    setIsPollingActive(false)
    setMeasurementComplete(false)
    setIsMeasurementEnabled(false)
    setEditableTols({})
    setSelectedPOId(null)
    setSelectedPOArticleId(null)
    setMeasurementSpecs([])
    setMeasuredValues({})
    setIsMeasurementEnabled(false)
    setError(null)
  }

  const handleBrandChange = (brandId: number | null) => {
    console.log('[SELECTION] Brand changed to:', brandId)
    setSelectedBrandId(brandId)
    setSelectedArticleId(null)
    setSelectedArticleTypeId(null)
    setSelectedPOId(null)
    setSelectedPOArticleId(null)
    setPurchaseOrders([])
    setMeasurementSpecs([])
    setMeasuredValues({})
    setAvailableSizes(['S', 'M', 'L', 'XL', 'XXL']) // Reset to defaults
  }

  const handleArticleChange = async (articleId: number | null) => {
    console.log('[SELECTION] Article changed to:', articleId)
    setSelectedArticleId(articleId)
    setSelectedPOId(null)
    setSelectedPOArticleId(null)
    setMeasurementSpecs([])
    setMeasuredValues({})

    const article = articles.find(a => a.id === articleId)
    if (article) {
      setSelectedArticleTypeId(article.article_type_id)
      // Load available sizes for this article from database
      const sizesLoaded = await fetchAvailableSizesAndReturn(article.id)

      // Don't auto-select size or auto-load measurements - let user choose
      // Just show available sizes and wait for user to select
      if (sizesLoaded && sizesLoaded.length > 0) {
        // If current size is valid, load measurements for it
        if (selectedSize && sizesLoaded.includes(selectedSize)) {
          console.log('[ARTICLE_CHANGE] Loading measurements for existing size selection:', selectedSize)
          await loadMeasurementsDirectlyFromArticle(article.id, selectedSize)
        } else {
          // Clear size selection - user needs to choose
          setSelectedSize(null)
          console.log('[ARTICLE_CHANGE] Sizes loaded, waiting for user to select size')
        }
      }
    } else {
      // Clear available sizes when no article selected
      setAvailableSizes([])
      setSelectedSize(null)
    }
  }

  // Helper function to fetch sizes and return them
  const fetchAvailableSizesAndReturn = async (articleId: number): Promise<string[]> => {
    try {
      const sql = `
        SELECT DISTINCT ms.size
        FROM measurement_sizes ms
        JOIN measurements m ON ms.measurement_id = m.id
        WHERE m.article_id = ?
        ORDER BY FIELD(ms.size, 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL')
      `
      const result = await window.database.query<{ size: string }>(sql, [articleId])
      if (result.success && result.data && result.data.length > 0) {
        const sizes = result.data.map(r => r.size)
        console.log('[SIZES] Loaded available sizes:', sizes)
        setAvailableSizes(sizes)
        return sizes
      }
    } catch (err) {
      console.error('Failed to fetch available sizes:', err)
    }
    setAvailableSizes(['S', 'M', 'L', 'XL', 'XXL'])
    return ['S', 'M', 'L', 'XL', 'XXL']
  }

  // Load measurements directly from article (without going through PO article)
  const loadMeasurementsDirectlyFromArticle = async (articleId: number, size: string) => {
    try {
      console.log('[DIRECT_LOAD] Loading measurements for article:', articleId, 'size:', size)
      const directQuery = `
        SELECT 
          m.id,
          m.code,
          m.measurement,
          COALESCE(m.tol_plus, 0) as tol_plus,
          COALESCE(m.tol_minus, 0) as tol_minus,
          ms.size,
          ms.value as expected_value,
          COALESCE(ms.unit, 'cm') as unit,
          a.id as article_id
        FROM articles a
        JOIN measurements m ON m.article_id = a.id
        JOIN measurement_sizes ms ON ms.measurement_id = m.id
        WHERE a.id = ? AND UPPER(TRIM(ms.size)) = UPPER(TRIM(?))
        ORDER BY m.code
      `
      const result = await window.database.query<MeasurementSpec & { article_id?: number }>(directQuery, [articleId, size])
      console.log('[DIRECT_LOAD] Query result:', result.data?.length || 0, 'measurements')

      if (result.success && result.data && result.data.length > 0) {
        console.log('[DIRECT_LOAD] ✓ Loaded measurements:', result.data.map((m: MeasurementSpec) => m.code).join(', '))
        setMeasurementSpecs(result.data as MeasurementSpec[])
        const initialValues: Record<number, string> = {}
        result.data.forEach((spec: MeasurementSpec) => {
          initialValues[spec.id] = ''
        })
        setMeasuredValues(initialValues)
      } else {
        console.log('[DIRECT_LOAD] ✗ No measurements found')
        setMeasurementSpecs([])
        setMeasuredValues({})
      }
    } catch (err) {
      console.error('[DIRECT_LOAD] Error:', err)
      setMeasurementSpecs([])
    }
  }

  const handleArticleTypeChange = (articleTypeId: number | null) => {
    console.log('[SELECTION] Article Type changed to:', articleTypeId)
    setSelectedArticleTypeId(articleTypeId)
    // Reset article selection when type changes
    setSelectedArticleId(null)
    setSelectedPOId(null)
    setSelectedPOArticleId(null)
    setPurchaseOrders([])
    setMeasurementSpecs([])
    setMeasuredValues({})
    setAvailableSizes(['S', 'M', 'L', 'XL', 'XXL']) // Reset to defaults
  }

  // Handle size change - reload measurements for new size
  const handleSizeChange = async (size: string) => {
    console.log('[SELECTION] Size changed to:', size)
    console.log('[SELECTION] Current selectedArticleId:', selectedArticleId)
    console.log('[SELECTION] Current selectedPOArticleId:', selectedPOArticleId)
    setSelectedSize(size)
    setMeasuredValues({})

    // Load measurements for the new size
    // Priority: use selectedArticleId if available (most reliable), otherwise use selectedPOArticleId
    if (selectedArticleId) {
      // Directly load measurements from the selected article
      console.log('[SIZE_CHANGE] Loading measurements directly from article:', selectedArticleId)
      await loadMeasurementsDirectlyFromArticle(selectedArticleId, size)
    } else if (selectedPOArticleId) {
      // Fall back to PO article based query
      await fetchMeasurementSpecsForArticle(selectedPOArticleId, size)
    }
  }

  // Fetch calibration status from Python API
  const fetchCalibrationStatus = async () => {
    try {
      const result = await window.measurement.getCalibrationStatus()
      if (result.status === 'success' && result.data) {
        setCalibrationStatus(result.data)
        console.log('[CALIBRATION] Status:', result.data.calibrated ? 'Calibrated' : 'Not calibrated')
        if (result.data.pixels_per_cm) {
          console.log('[CALIBRATION] Scale:', result.data.pixels_per_cm.toFixed(2), 'px/cm')
        }
      }
    } catch (err) {
      console.error('[CALIBRATION] Failed to fetch status:', err)
    }
  }

  // Start camera calibration
  const handleStartCalibration = async () => {
    try {
      setIsCalibrating(true)
      setError(null)
      console.log('[CALIBRATION] Starting calibration process...')

      const result = await window.measurement.startCalibration()

      if (result.status === 'success') {
        console.log('[CALIBRATION] Calibration window opened. Follow on-screen instructions.')
        // Poll for calibration status every 2 seconds
        const pollInterval = setInterval(async () => {
          const statusResult = await window.measurement.getCalibrationStatus()
          if (statusResult.status === 'success' && statusResult.data) {
            setCalibrationStatus(statusResult.data)
            if (statusResult.data.calibrated) {
              console.log('[CALIBRATION] Calibration completed successfully!')
              setIsCalibrating(false)
              clearInterval(pollInterval)
            }
          }
        }, 2000)

        // Stop polling after 5 minutes (timeout)
        setTimeout(() => {
          clearInterval(pollInterval)
          setIsCalibrating(false)
        }, 300000)
      } else {
        setError(result.message || 'Failed to start calibration')
        setIsCalibrating(false)
      }
    } catch (err) {
      console.error('[CALIBRATION] Error:', err)
      setError('Calibration service unavailable')
      setIsCalibrating(false)
    }
  }

  // Fetch calibration status on mount
  useEffect(() => {
    fetchCalibrationStatus()
  }, [])

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-surface">
      {/* Error Message - Touch Friendly */}
      {error && (
        <div className="mx-4 mt-3 bg-error-light border-2 border-error/20 text-error px-5 py-4 rounded-xl flex items-center gap-4">
          <svg className="w-7 h-7 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-touch-base font-semibold flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl hover:bg-error/10 transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Main 2-Column Layout - No Scroll Except Measurement Table */}
      <div className="flex gap-4 flex-1 min-h-0 p-4 overflow-hidden">

        {/* LEFT SIDE - Brand + Article Selection + Size */}
        <div className="w-[50%] flex flex-col gap-4 overflow-hidden">

          {/* Brand Selection - Main Section */}
          <div className="card p-4 shrink-0">
            <h3 className="text-touch-lg font-bold text-primary mb-3 flex items-center gap-2">
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Select Brand
            </h3>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide py-2 px-2 -mx-2">
              {brands.map((brand) => {
                // Map brand names to logo files
                const logoMap: Record<string, string> = {
                  'nike': '/company logo/black-nike-logo-transparent-background-701751694777156f3ewilq1js.png',
                  'adidas': '/company logo/Adidas_Logo.svg.png',
                  'puma': '/company logo/puma.png',
                  'reebok': '/company logo/Reebok_logo19.png',
                  'new balance': '/company logo/New_Balance_logo.svg.png',
                  'under armour': '/company logo/Under_Armour-Logo.wine.png',
                  'champion': '/company logo/champian.jpg',
                  'fila': '/company logo/fila-logo-design-history-and-evolution-kreafolk_94ed6bf4-6bfd-44f9-a60c-fd3f570e120e.webp',
                }
                const logoPath = logoMap[brand.name.toLowerCase()] || null

                return (
                  <button
                    key={brand.id}
                    onClick={() => handleBrandChange(brand.id)}
                    className={`flex-shrink-0 h-28 w-36 p-3 rounded-xl border-3 transition-all duration-200 flex items-center justify-center bg-white brand-logo-bg ${selectedBrandId === brand.id
                      ? 'border-primary shadow-xl shadow-primary/30 scale-105 ring-2 ring-primary/20'
                      : 'border-slate-200 hover:border-secondary hover:shadow-lg hover:scale-102'
                      }`}
                    title={brand.name}
                  >
                    {logoPath ? (
                      <img
                        src={logoPath}
                        alt={brand.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-3xl font-black text-primary">
                        {brand.name.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Article Type Selection - Button Pills */}
          <div className="card p-6">
            <h3 className="text-touch-2xl font-bold text-primary mb-5 flex items-center gap-3">
              <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Article Type
            </h3>
            {!selectedBrandId ? (
              <div className="text-center py-6 text-slate-400 text-touch-lg italic">Select a brand first</div>
            ) : articleTypes.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-touch-lg">No article types available</div>
            ) : (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {articleTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleArticleTypeChange(type.id)}
                    className={`flex-shrink-0 px-6 py-4 rounded-xl text-touch-lg font-bold transition-all duration-200 border-2 ${selectedArticleTypeId === type.id
                      ? 'bg-secondary text-white border-secondary shadow-lg shadow-secondary/30'
                      : 'bg-white text-primary border-slate-200 hover:border-secondary hover:text-secondary'
                      }`}
                  >
                    {type.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Article Style Selection - Button Pills */}
          <div className="card p-6">
            <h3 className="text-touch-2xl font-bold text-primary mb-5 flex items-center gap-3">
              <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Article Style
            </h3>
            {!selectedBrandId ? (
              <div className="text-center py-6 text-slate-400 text-touch-lg italic">Select a brand first</div>
            ) : articles.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-touch-lg">No articles available</div>
            ) : (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {articles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => handleArticleChange(article.id)}
                    className={`flex-shrink-0 px-6 py-4 rounded-xl text-touch-lg font-bold transition-all duration-200 border-2 ${selectedArticleId === article.id
                      ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30'
                      : 'bg-white text-primary border-slate-200 hover:border-primary hover:bg-surface-teal'
                      }`}
                  >
                    {article.article_style}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Size Selection - Large Button Pills */}
          <div className="card p-6 flex-1">
            <h3 className="text-touch-2xl font-bold text-primary mb-5 flex items-center gap-3">
              <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Size Selection
            </h3>
            {availableSizes.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-touch-lg italic">
                Select an article to load sizes
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
                {availableSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    className={`flex-shrink-0 min-w-[80px] px-6 py-4 rounded-xl text-touch-xl font-black transition-all duration-200 border-3 ${selectedSize === size
                      ? 'bg-secondary text-white border-secondary shadow-xl shadow-secondary/40 scale-110'
                      : 'bg-white text-primary border-slate-200 hover:border-secondary hover:shadow-lg'
                      }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE - Live Measurement Table - NO HORIZONTAL SCROLL */}
        <div className="w-[50%] card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 bg-white shrink-0">
            <h3 className="text-touch-xl font-bold text-primary flex items-center gap-3">
              <span className={`w-4 h-4 rounded-full ${isPollingActive ? 'bg-success animate-pulse' : 'bg-slate-300'}`}></span>
              Live Measurement
              <span className="ml-auto text-touch-base font-bold text-white bg-accent px-4 py-2 rounded-lg">
                {selectedSize || 'No Size'}
              </span>
            </h3>
          </div>
          <div className="overflow-y-auto overflow-x-hidden flex-1">
            <table className="w-full text-touch-base">
              <thead className="bg-surface-teal sticky top-0 z-10 border-b-2 border-primary/10">
                <tr>
                  <th className="px-3 py-4 text-left text-touch-sm font-bold text-primary uppercase tracking-wide w-14">Code</th>
                  <th className="px-3 py-4 text-left text-touch-sm font-bold text-primary uppercase tracking-wide">Measurement</th>
                  <th className="px-3 py-4 text-center text-touch-sm font-bold text-primary uppercase tracking-wide w-16">Spec</th>
                  <th className="px-3 py-4 text-center text-touch-sm font-bold text-primary uppercase tracking-wide w-28">Tol ±</th>
                  <th className="px-3 py-4 text-center text-touch-sm font-bold text-primary uppercase tracking-wide w-18">Result</th>
                  <th className="px-3 py-4 text-center text-touch-sm font-bold text-primary uppercase tracking-wide w-14">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Render measurement specs if available, otherwise show empty state */}
                {measurementSpecs.length > 0 ? (
                  measurementSpecs.map((spec) => {
                    const status = calculateStatus(spec)
                    return (
                      <tr key={spec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-2 py-3 font-mono text-touch-sm font-bold text-primary">{spec.code}</td>
                        <td className="px-2 py-3 text-touch-sm text-slate-600 truncate max-w-[120px]" title={spec.measurement}>{spec.measurement}</td>
                        <td className="px-2 py-3 text-center font-bold text-slate-800 text-touch-base">{spec.expected_value}</td>

                        {/* Tol± Column - SINGLE INPUT with touch arrows, applies to BOTH +/- */}
                        <td className="px-2 py-3 text-center">
                          {measurementComplete || !isPollingActive ? (
                            <div className="inline-flex items-center gap-1 bg-surface-teal rounded-xl p-1">
                              {/* Down Arrow */}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentVal = parseFloat(editableTols[spec.id]?.tol_plus ?? spec.tol_plus.toString()) || 0
                                  const newVal = Math.max(0, currentVal - 0.1).toFixed(1)
                                  handleToleranceChange(spec.id, 'tol_plus', newVal)
                                  handleToleranceChange(spec.id, 'tol_minus', newVal)
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary font-bold hover:bg-primary hover:text-white active:bg-primary-dark transition-all shadow-sm"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {/* Single Input */}
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={editableTols[spec.id]?.tol_plus ?? spec.tol_plus.toString()}
                                onChange={(e) => {
                                  handleToleranceChange(spec.id, 'tol_plus', e.target.value)
                                  handleToleranceChange(spec.id, 'tol_minus', e.target.value)
                                }}
                                className="w-14 h-9 px-2 text-center text-touch-base font-bold text-primary bg-white border-2 border-primary/20 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              {/* Up Arrow */}
                              <button
                                type="button"
                                onClick={() => {
                                  const currentVal = parseFloat(editableTols[spec.id]?.tol_plus ?? spec.tol_plus.toString()) || 0
                                  const newVal = (currentVal + 0.1).toFixed(1)
                                  handleToleranceChange(spec.id, 'tol_plus', newVal)
                                  handleToleranceChange(spec.id, 'tol_minus', newVal)
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary font-bold hover:bg-primary hover:text-white active:bg-primary-dark transition-all shadow-sm"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="inline-block px-3 py-1.5 bg-surface-teal rounded-lg text-touch-base font-bold text-primary">
                              ±{spec.tol_plus}
                            </span>
                          )}
                        </td>

                        {/* Result - READ ONLY */}
                        <td className="px-2 py-3 text-center">
                          <div className={`px-2 py-1.5 rounded text-touch-base font-bold ${measuredValues[spec.id]
                            ? status === 'PASS' ? 'bg-success/10 text-success' : status === 'FAIL' ? 'bg-error/10 text-error' : 'bg-slate-100 text-primary'
                            : 'bg-slate-50 text-slate-300'
                            }`}>
                            {measuredValues[spec.id] || '--'}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-2 py-3 text-center">
                          {status === 'PASS' && (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success/10 text-success">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                          {status === 'FAIL' && (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-error/10 text-error">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </span>
                          )}
                          {status === 'PENDING' && isPollingActive && (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-500">
                              <span className="w-3 h-3 bg-current rounded-full animate-pulse"></span>
                            </span>
                          )}
                          {status === 'PENDING' && !isPollingActive && (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-300">
                              <span className="w-2 h-0.5 bg-current rounded-full"></span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  [...Array(12)].map((_, index) => (
                    <tr key={`empty-${index}`} className="opacity-30">
                      <td className="px-2 py-3"><div className="h-5 bg-slate-100 rounded w-10"></div></td>
                      <td className="px-2 py-3"><div className="h-5 bg-slate-100 rounded w-20"></div></td>
                      <td className="px-2 py-3 text-center"><div className="h-5 bg-slate-100 rounded w-10 mx-auto"></div></td>
                      <td className="px-2 py-3 text-center"><div className="h-10 bg-slate-100 rounded w-12 mx-auto"></div></td>
                      <td className="px-2 py-3 text-center"><div className="h-8 bg-slate-100 rounded w-12 mx-auto"></div></td>
                      <td className="px-2 py-3 text-center"><div className="h-8 w-8 bg-slate-100 rounded-full mx-auto"></div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Measurement Action Button - Fixed at bottom */}
          <div className="px-4 py-4 border-t border-slate-200 bg-white shrink-0">
            {!isMeasurementEnabled ? (
              <div className="flex gap-3">
                <button
                  onClick={handleStartMeasurement}
                  disabled={!selectedSize}
                  className={`flex-1 py-4 rounded-xl text-touch-lg font-bold transition-all flex items-center justify-center gap-3 ${selectedSize
                    ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/30'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Measurement
                </button>
                <button
                  onClick={handleTestAnnotationMeasurement}
                  disabled={!selectedSize}
                  className={`px-6 py-4 rounded-xl text-touch-lg font-bold transition-all flex items-center justify-center gap-2 ${selectedSize
                    ? 'bg-secondary text-white hover:bg-secondary-dark shadow-lg shadow-secondary/30'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  title="Test with sample data"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Test
                </button>
              </div>
            ) : isPollingActive ? (
              <button
                onClick={handleCompleteMeasurement}
                className="w-full py-4 rounded-xl text-touch-lg font-bold bg-success text-white hover:bg-success/90 transition-all flex items-center justify-center gap-3 shadow-lg shadow-success/30"
              >
                <span className="w-3 h-3 rounded-full bg-white animate-pulse"></span>
                Complete Measurement
              </button>
            ) : (
              <div className="w-full py-4 rounded-xl text-touch-lg font-bold bg-success-light text-success border-2 border-success/30 flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Measurement Complete
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


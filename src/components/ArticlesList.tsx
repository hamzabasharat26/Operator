import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import type {
  ArticleWithRelations,
  MeasurementSpec,
  JobCardSummary,
  PurchaseOrderArticle,
  Brand,
  ArticleAnnotation
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
    if (!selectedPOId) {
      setError('Please select a Purchase Order first')
      return
    }

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

      console.log('[MEASUREMENT] Fetching annotation from database for:', articleStyle, 'size:', selectedSize)

      // Fetch annotation data from database - include new measurement columns
      const annotationResult = await window.database.query<ArticleAnnotation>(
        `SELECT id, article_style, size, name, annotations, 
                keypoints_pixels, target_distances, placement_box,
                image_width, image_height,
                image_data, image_mime_type 
         FROM article_annotations 
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
        console.log('[MEASUREMENT] No annotation found in database')
        setError(`No annotation found for ${articleStyle} size ${selectedSize}. Please create annotation first.`)
        return
      }

      const annotation = annotationResult.data[0]
      console.log('[MEASUREMENT] Found annotation:', annotation.name, 'ID:', annotation.id)
      console.log('[MEASUREMENT] Keypoints pixels:', annotation.keypoints_pixels)
      console.log('[MEASUREMENT] Target distances from DB:', annotation.target_distances)
      console.log('[MEASUREMENT] Image dimensions:', annotation.image_width, 'x', annotation.image_height)

      // If target_distances is missing, try to generate it from measurements table
      let targetDistances = annotation.target_distances
      if (!targetDistances) {
        console.log('[MEASUREMENT] target_distances is NULL, fetching from measurements table...')
        
        // Get the article_id for this annotation
        const articleResult = await window.database.query<{ id: number }>(
          `SELECT id FROM articles WHERE article_style = ? LIMIT 1`,
          [articleStyle]
        )
        
        if (articleResult.success && articleResult.data && articleResult.data.length > 0) {
          const articleId = articleResult.data[0].id
          
          // Fetch measurements and their target values for this article and size
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
            // Build target_distances object: {"1": value1, "2": value2, ...}
            const generatedTargets: Record<string, number> = {}
            measurementsResult.data.forEach((m, index) => {
              generatedTargets[String(index + 1)] = Number(m.target_value)
            })
            
            targetDistances = JSON.stringify(generatedTargets)
            console.log('[MEASUREMENT] Generated target_distances from DB:', targetDistances)
            console.log('[MEASUREMENT] Found', measurementsResult.data.length, 'measurements:', 
              measurementsResult.data.map(m => `${m.measurement_name}=${m.target_value}cm`).join(', '))
          } else {
            console.log('[MEASUREMENT] WARNING: No measurement values found in database for this article/size')
          }
        }
      }

      // Validate annotation has required data - prefer keypoints_pixels for measurement system
      if (!annotation.keypoints_pixels && !annotation.annotations) {
        setError(`No annotation points found for ${articleStyle} size ${selectedSize}. Please create annotation in the web app first.`)
        return
      }

      // Parse and validate keypoints count
      let keypointsCount = 0
      try {
        if (annotation.keypoints_pixels) {
          const kp = typeof annotation.keypoints_pixels === 'string' 
            ? JSON.parse(annotation.keypoints_pixels) 
            : annotation.keypoints_pixels
          keypointsCount = Array.isArray(kp) ? kp.length : 0
        }
      } catch (e) {
        console.error('[MEASUREMENT] Failed to parse keypoints:', e)
      }

      if (keypointsCount < 2) {
        setError(`Insufficient annotation points (${keypointsCount}) for ${articleStyle} size ${selectedSize}. Need at least 2 points for measurement.`)
        return
      }

      if (!annotation.image_data) {
        setError(`Reference image not found for ${articleStyle} size ${selectedSize}. Please re-capture the annotation.`)
        return
      }

      // Start the Python measurement process via Electron IPC with database annotation
      const result = await window.measurement.start({
        annotation_name: selectedSize,
        article_style: articleStyle,
        side: 'front',
        // Pass measurement-ready data from database (use generated targetDistances if DB was null)
        keypoints_pixels: annotation.keypoints_pixels || null,
        target_distances: targetDistances || null,
        placement_box: annotation.placement_box || null,
        image_width: annotation.image_width || null,
        image_height: annotation.image_height || null,
        // Fallback: also pass percentage annotations for conversion if keypoints_pixels not available
        annotation_data: annotation.annotations,
        image_data: annotation.image_data,
        image_mime_type: annotation.image_mime_type || 'image/jpeg'
      })

      if (result.status === 'success') {
        setIsMeasurementEnabled(true)
        setIsPollingActive(true) // Start live polling
        setError(null)
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
      
      const testKeypoints = [
        [1741, 1386], [1666, 2085], [3348, 1386], [3420, 2065],
        [172, 1997], [360, 1890], [1822, 3010], [3297, 2970],
        [4691, 1833], [4815, 1935], [180, 1997], [262, 2207],
        [2230, 1199], [2821, 1199], [1698, 1296], [2199, 1098],
        [2843, 1120], [3366, 1284], [1869, 3197], [3220, 3146]
      ]
      
      const testTargetDistances = {
        "1": 37.64317350838128,
        "2": 36.60339138534189,
        "3": 11.536302812910455,
        "4": 79.10898847829691,
        "5": 5.149846703002018,
        "6": 12.071405982636598,
        "7": 31.59187822847334,
        "8": 28.72608060969501,
        "9": 29.364941578781927,
        "10": 72.49463243526145
      }

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
        placement_box: JSON.stringify([]),
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

  return (
    <div className="h-full w-full py-1 flex flex-col overflow-hidden">
      {/* Error Message */}
      {error && (
        <div className="mb-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Main 2-Column Layout: Left = Selection Grid, Right = Measurement Table */}
      <div className="flex gap-1 flex-1 min-h-0 bg-transparent">

        {/* LEFT SIDE - Selection Grid (4-box layout) */}
        <div className="w-[60%] grid grid-cols-2 gap-2 auto-rows-min order-1 pt-1">
          {/* TOP LEFT - Comprehensive Selection (Brand, Style, Type, PO) */}
          <div className="card p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Brand */}
                <div>
                  <label className="block mb-2">Brand</label>
                  <select
                    value={selectedBrandId || ''}
                    onChange={(e) => handleBrandChange(e.target.value ? Number(e.target.value) : null)}
                    className="input-field"
                  >
                    <option value="">Select Brand</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                  </select>
                </div>

                {/* Article Type */}
                <div>
                  <label className="block mb-2">Article Type</label>
                  <select
                    value={selectedArticleTypeId || ''}
                    onChange={(e) => handleArticleTypeChange(e.target.value ? Number(e.target.value) : null)}
                    disabled={!selectedBrandId}
                    className="input-field"
                  >
                    <option value="">Select Type</option>
                    {articleTypes.map((type) => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Article Style */}
              <div>
                <label className="block mb-2">Article Style</label>
                <select
                  value={selectedArticleId || ''}
                  onChange={(e) => handleArticleChange(e.target.value ? Number(e.target.value) : null)}
                  disabled={!selectedBrandId}
                  className="input-field"
                >
                  <option value="">Select Article</option>
                  {articles.map((article) => (
                    <option key={article.id} value={article.id}>{article.article_style}</option>
                  ))}
                </select>
              </div>

              {/* Purchase Order Selection */}
              <div>
                <label className="block mb-4">Purchase Order</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {purchaseOrders.length === 0 ? (
                    <span className="text-secondary text-xs italic">No orders available</span>
                  ) : (
                    purchaseOrders.slice(0, 8).map((po) => (
                      <button
                        key={po.id}
                        onClick={() => setSelectedPOId(po.id)}
                        className={`w-10 h-10 rounded-md border text-xs font-bold transition-all ${selectedPOId === po.id
                          ? 'border-accent-active bg-primary text-white shadow-sm ring-1 ring-accent-active/20'
                          : 'border-slate-200 bg-white text-secondary hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        title={po.po_number}
                      >
                        {po.po_number.slice(-3)}
                      </button>
                    ))
                  )}
                </div>
                {selectedPOId && (
                  <p className="mt-3 text-[11px] text-accent-active font-bold flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-active mr-2"></span>
                    ID: {purchaseOrders.find(p => p.id === selectedPOId)?.po_number}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Job Card Summary (Expanded Vertically) */}
          <div className="row-span-2 card p-5">
            <h3 className="text-sm font-bold text-primary mb-4 border-b border-slate-100 pb-3 flex items-center">
              <svg className="w-4 h-4 mr-2 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Job Card Summary
            </h3>
            <div className="space-y-4 flex-1">
              {[
                { label: 'PO Number', value: jobCardSummary?.po_number },
                { label: 'Brand', value: jobCardSummary?.brand_name },
                { label: 'Style', value: jobCardSummary?.article_style },
                { label: 'Type', value: jobCardSummary?.article_type_name },
                { label: 'Origin', value: jobCardSummary?.country },
              ].map((item, idx) => (
                <div key={idx} className="pb-1">
                  <label className="block mb-2">{item.label}</label>
                  <div className="px-3 py-2 border border-slate-100 rounded bg-slate-50 font-bold text-primary text-xs tracking-tight">
                    {item.value || '---'}
                  </div>
                </div>
              ))}
              <div className="flex-1 flex flex-col min-h-0">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Description</label>
                <div className="flex-1 px-3 py-3 border border-slate-100 rounded bg-slate-50/50 text-slate-600 text-sm overflow-y-auto leading-relaxed min-h-[100px]">
                  {jobCardSummary?.article_description || <span className="text-slate-300 italic">No description available</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <label className="block mb-4">Size Selection</label>
            {availableSizes.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-sm italic">
                Select an article to load available sizes
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 content-start pt-1">
                {availableSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    className={`py-2 rounded-md border text-xs font-bold transition-all ${selectedSize === size
                      ? 'border-accent-active bg-primary text-white shadow-sm ring-1 ring-accent-active/20'
                      : 'border-slate-200 bg-white text-secondary hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE - Live Measurement Table (7 columns, 24 rows) */}
        <div className="w-[40%] card overflow-hidden order-2">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              Live Measurement Table
              <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full uppercase">
                Size: {selectedSize || 'Not Selected'}
              </span>
            </h3>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm table-zebra">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-secondary uppercase tracking-wider">Code</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-secondary uppercase tracking-wider">Measurement</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-secondary uppercase tracking-wider">Spec</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-secondary uppercase tracking-wider">Tol+</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-secondary uppercase tracking-wider">Tol-</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-secondary uppercase tracking-wider">Result</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Render measurement specs if available, otherwise show 24 empty rows */}
                {measurementSpecs.length > 0 ? (
                  measurementSpecs.map((spec) => {
                    // Calculate status directly inline for each row
                    const status = calculateStatus(spec)
                    return (
                      <tr key={spec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-2 font-mono text-[11px] font-bold text-primary">{spec.code}</td>
                        <td className="px-3 py-2 text-slate-600 text-[12px] truncate max-w-[140px]" title={spec.measurement}>{spec.measurement}</td>
                        <td className="px-3 py-2 text-center font-bold text-slate-800">{spec.expected_value}</td>
                        <td className="px-3 py-2 text-center">
                          {measurementComplete || !isPollingActive ? (
                            <div className="inline-flex items-center border border-slate-200 rounded overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleToleranceStep(spec.id, 'tol_plus', -0.1)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-r border-slate-200"
                              >−</button>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={editableTols[spec.id]?.tol_plus ?? spec.tol_plus.toString()}
                                onChange={(e) => handleToleranceChange(spec.id, 'tol_plus', e.target.value)}
                                className="w-12 px-1 py-0.5 text-center text-xs font-semibold text-success focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleToleranceStep(spec.id, 'tol_plus', 0.1)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-l border-slate-200"
                              >+</button>
                            </div>
                          ) : (
                            <span className="text-success font-semibold">+{spec.tol_plus}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {measurementComplete || !isPollingActive ? (
                            <div className="inline-flex items-center border border-slate-200 rounded overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleToleranceStep(spec.id, 'tol_minus', -0.1)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-r border-slate-200"
                              >−</button>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={editableTols[spec.id]?.tol_minus ?? spec.tol_minus.toString()}
                                onChange={(e) => handleToleranceChange(spec.id, 'tol_minus', e.target.value)}
                                className="w-12 px-1 py-0.5 text-center text-xs font-semibold text-error focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleToleranceStep(spec.id, 'tol_minus', 0.1)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-l border-slate-200"
                              >+</button>
                            </div>
                          ) : (
                            <span className="text-error font-semibold">-{spec.tol_minus}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isPollingActive ? (
                            // During live measurement - show live value with indicator
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={measuredValues[spec.id] || ''}
                                onChange={(e) => handleMeasuredValueChange(spec.id, e.target.value)}
                                placeholder="--"
                                className="w-16 px-1.5 py-1 border border-success rounded text-center text-xs font-bold text-primary bg-success/5 focus:outline-none focus:ring-2 focus:ring-success/20 transition-all animate-pulse"
                                readOnly
                              />
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full animate-ping"></span>
                            </div>
                          ) : (
                            // When not measuring - editable field with increment/decrement
                            <div className="inline-flex items-center border border-slate-200 rounded overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleMeasuredValueStep(spec.id, -0.5)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-r border-slate-200"
                              >−</button>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={measuredValues[spec.id] || ''}
                                onChange={(e) => handleMeasuredValueChange(spec.id, e.target.value)}
                                placeholder="0.00"
                                className="w-14 px-1 py-0.5 text-center text-xs font-bold text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleMeasuredValueStep(spec.id, 0.5)}
                                className="px-1 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs border-l border-slate-200"
                              >+</button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {status === 'PASS' && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/10 text-success">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                          {status === 'FAIL' && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-error/10 text-error">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </span>
                          )}
                          {status === 'PENDING' && isPollingActive && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-500">
                              <span className="w-2 h-2 bg-current rounded-full animate-pulse"></span>
                            </span>
                          )}
                          {status === 'PENDING' && !isPollingActive && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-300">
                              <span className="w-1.5 h-0.5 bg-current rounded-full"></span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  [...Array(24)].map((_, index) => (
                    <tr key={`empty-${index}`} className="opacity-20">
                      <td className="px-3 py-2 text-slate-300"></td>
                      <td className="px-3 py-2 text-slate-300"></td>
                      <td className="px-3 py-2 text-center text-slate-300"></td>
                      <td className="px-3 py-2 text-center text-slate-300"></td>
                      <td className="px-3 py-2 text-center text-slate-300"></td>
                      <td className="px-3 py-2 text-center">
                        <div className="w-16 h-6 bg-slate-50 border border-slate-200/50 rounded-sm mx-auto"></div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="w-5 h-5 rounded-full bg-slate-50 border border-slate-200/50 mx-auto"></div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Action Bar - Industry 4.0 */}
      <div className="mt-auto pt-4 border-t border-slate-100 flex justify-center items-center gap-6 pb-2">
        {/* Back Article Button */}
        <button
          onClick={isMeasurementEnabled ? handlePreviousArticle : handleBack}
          disabled={isSaving || (isMeasurementEnabled && currentPOArticleIndex === 0)}
          className="btn-industrial border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 flex items-center min-w-[160px] justify-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          {isMeasurementEnabled ? 'Previous' : 'Back to Selection'}
        </button>

        {/* Start Measurement / Complete / Status */}
        {!isMeasurementEnabled ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartMeasurement}
              disabled={!selectedPOId}
              className="btn-industrial bg-primary text-white hover:bg-slate-800 flex items-center min-w-[200px] justify-center shadow-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Measurement
            </button>
            {/* TEST ANNOTATION BUTTON */}
            <button
              onClick={handleTestAnnotationMeasurement}
              disabled={!selectedSize}
              className="btn-industrial bg-orange-500 text-white hover:bg-orange-600 flex items-center min-w-[180px] justify-center shadow-sm"
              title="Use test annotation (20 keypoints, 10 measurements)"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Test Annotation
            </button>
          </div>
        ) : isPollingActive ? (
          <button
            onClick={handleCompleteMeasurement}
            className="btn-industrial bg-success text-white hover:bg-green-600 flex items-center min-w-[240px] justify-center shadow-sm transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-white mr-2 animate-pulse"></span>
            Complete Measurement
          </button>
        ) : (
          <div className="btn-industrial bg-slate-100 text-success flex items-center min-w-[240px] justify-center border border-success/30">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Measurement Complete
          </div>
        )}

        {/* Next Article / Finish Button */}
        <button
          onClick={handleNextArticle}
          disabled={isSaving || (!measurementComplete && !isMeasurementEnabled)}
          className={`btn-industrial flex items-center min-w-[160px] justify-center ${(measurementComplete || isMeasurementEnabled)
            ? 'bg-primary text-white hover:bg-slate-800 shadow-sm'
            : 'border border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
            }`}
        >
          {isSaving ? (
            <>
              <div className="w-3.5 h-3.5 mr-2 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Saving...
            </>
          ) : (
            <>
              {currentPOArticleIndex < poArticles.length - 1 ? 'Next Article' : 'Finish Inspection'}
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import * as XLSX from 'xlsx'
import Modal from './components/Modal'
import './App.css'

function App() {
  const [payments, setPayments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    place: '',
    amountReceived: '',
    amountReceivable: ''
  })
  const [editingCell, setEditingCell] = useState(null) // { id: paymentId, field: 'name' | 'place' | 'amountReceived' | 'amountReceivable' }
  const [editValue, setEditValue] = useState('')
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: null,
    showCancel: false
  })
  const [loading, setLoading] = useState({
    uploading: false,
    submitting: false,
    saving: false,
    deleting: null, // stores the id of the item being deleted
    deletingAll: false
  })
  const [nameSuggestions, setNameSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isFormExpanded, setIsFormExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Fetch payments from Firebase
  useEffect(() => {
    fetchPayments()
  }, [])

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // Modal helper functions
  const showModal = (type, title, message, onConfirm = null, showCancel = false) => {
    setModal({
      isOpen: true,
      type,
      title,
      message,
      onConfirm,
      showCancel
    })
  }

  const closeModal = () => {
    setModal({
      isOpen: false,
      type: 'info',
      title: '',
      message: '',
      onConfirm: null,
      showCancel: false
    })
  }

  const fetchPayments = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'payments'))
      const paymentsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      
      // Sort: Excel entries (with orderIndex) by orderIndex, then manual entries by createdAt
      paymentsData.sort((a, b) => {
        // If both have orderIndex, sort by orderIndex
        if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
          return a.orderIndex - b.orderIndex
        }
        // If only one has orderIndex, prioritize it (Excel entries first)
        if (a.orderIndex !== undefined) return -1
        if (b.orderIndex !== undefined) return 1
        // Both are manual entries, sort by createdAt (oldest first to maintain entry order)
        const aTime = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || (a.createdAt ? new Date(a.createdAt).getTime() : 0)
        const bTime = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || (b.createdAt ? new Date(b.createdAt).getTime() : 0)
        return aTime - bTime
      })
      
      // Add serial numbers based on original Excel row (orderIndex) or position
      // For Excel entries, use orderIndex + 1 (original row number)
      // For manual entries, assign sequential numbers after Excel entries
      let manualEntryCounter = 0
      const maxExcelOrderIndex = paymentsData
        .filter(p => p.orderIndex !== undefined)
        .reduce((max, p) => Math.max(max, p.orderIndex), -1)
      
      const paymentsWithSno = paymentsData.map((payment) => {
        if (payment.orderIndex !== undefined) {
          // Excel entry: use original row number (orderIndex + 1)
          return {
            ...payment,
            sno: payment.orderIndex + 1
          }
        } else {
          // Manual entry: assign number after Excel entries
          manualEntryCounter++
          return {
            ...payment,
            sno: maxExcelOrderIndex + 1 + manualEntryCounter
          }
        }
      })
      
      setPayments(paymentsWithSno)
    } catch (error) {
      console.error('Error fetching payments:', error)
      showModal('error', 'Error', 'Error fetching payments. Please try again.')
    }
  }

  // Calculate balance
  const calculateBalance = (received, receivable) => {
    const receivedNum = parseFloat(received) || 0
    const receivableNum = parseFloat(receivable) || 0
    return receivedNum - receivableNum
  }

  // Get balance color
  const getBalanceColor = (balance) => {
    if (balance > 0) return 'red'
    if (balance < 0) return 'green'
    return 'blue'
  }

  // Format balance for display (show absolute value for negative balances)
  const formatBalance = (balance) => {
    return Math.abs(balance).toFixed(2)
  }

  // Capitalize first letter of a string
  const capitalizeFirst = (str) => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  // Handle Excel file upload
  const handleExcelUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setLoading({ ...loading, uploading: true })

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // Get the maximum existing orderIndex to continue from there
        const existingPayments = await getDocs(collection(db, 'payments'))
        let maxOrderIndex = -1
        existingPayments.forEach((doc) => {
          const data = doc.data()
          if (data.orderIndex !== undefined && data.orderIndex > maxOrderIndex) {
            maxOrderIndex = data.orderIndex
          }
        })

        // Process and add each row to Firebase using batch writes for speed
        // Expected columns: Name, Place, Amount Received, Amount Receivable, Balance
        let orderIndex = maxOrderIndex + 1
        const baseTimestamp = Date.now()
        const batchSize = 500 // Firestore batch limit
        const batches = []
        let currentBatch = writeBatch(db)
        let batchCount = 0
        
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i]
          const paymentData = {
            name: row.Name || row.name || '',
            place: row.Place || row.place || '',
            amountReceived: parseFloat(row['Amount Received'] || row['Amount received'] || row.amountReceived || 0) || 0,
            amountReceivable: parseFloat(row['Amount Receivable'] || row['Amount receivable'] || row.amountReceivable || row['Amount Given'] || row['Amount given'] || row.amountGiven || 0) || 0,
            createdAt: new Date(baseTimestamp + i), // Sequential timestamps to preserve order
            orderIndex: orderIndex // Preserve Excel row order
          }

          // Balance column is read but not stored (we calculate it from amountReceived - amountReceivable)
          // Balance can be used for validation if needed: row.Balance || row.balance || row['Balance']

          if (paymentData.name) {
            const docRef = doc(collection(db, 'payments'))
            currentBatch.set(docRef, paymentData)
            batchCount++
            orderIndex++

            // Commit batch when it reaches the limit
            if (batchCount >= batchSize) {
              batches.push(currentBatch.commit())
              currentBatch = writeBatch(db)
              batchCount = 0
            }
          }
        }

        // Commit remaining items in the last batch
        if (batchCount > 0) {
          batches.push(currentBatch.commit())
        }

        // Execute all batches in parallel
        await Promise.all(batches)
        setLoading({ ...loading, uploading: false })
        showModal('success', 'Success', 'Excel data uploaded successfully!')
        fetchPayments()
        event.target.value = '' // Reset file input
      } catch (error) {
        console.error('Error processing Excel file:', error)
        setLoading({ ...loading, uploading: false })
        showModal('error', 'Error', 'Error processing Excel file. Please check the format.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Handle manual form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name || !formData.amountReceived) {
      showModal('warning', 'Validation Error', 'Name and Amount Received are required!')
      return
    }

    setLoading({ ...loading, submitting: true })

    try {
      const paymentData = {
        name: formData.name,
        place: formData.place || '',
        amountReceived: parseFloat(formData.amountReceived) || 0,
        amountReceivable: parseFloat(formData.amountReceivable) || 0,
        createdAt: new Date()
      }

      await addDoc(collection(db, 'payments'), paymentData)
      setLoading({ ...loading, submitting: false })
      showModal('success', 'Success', 'Payment added successfully!')
      setFormData({
        name: '',
        place: '',
        amountReceived: '',
        amountReceivable: ''
      })
      setNameSuggestions([])
      setShowSuggestions(false)
      fetchPayments()
    } catch (error) {
      console.error('Error adding payment:', error)
      setLoading({ ...loading, submitting: false })
      showModal('error', 'Error', 'Error adding payment. Please try again.')
    }
  }

  // Handle cell click to start editing
  const handleCellClick = (payment, field) => {
    let value = ''
    if (field === 'name') {
      value = payment.name
    } else if (field === 'place') {
      value = payment.place || ''
    } else if (field === 'amountReceived') {
      value = payment.amountReceived.toString()
    } else if (field === 'amountReceivable') {
      value = (payment.amountReceivable || payment.amountGiven || 0).toString()
    }
    setEditingCell({ id: payment.id, field })
    setEditValue(value)
  }

  // Handle cell blur to auto-save
  const handleCellBlur = async (payment) => {
    if (!editingCell || editingCell.id !== payment.id) return

    setLoading({ ...loading, saving: true })
    try {
      const paymentRef = doc(db, 'payments', payment.id)
      const updateData = {}
      
      if (editingCell.field === 'name') {
        updateData.name = editValue.trim()
      } else if (editingCell.field === 'place') {
        updateData.place = editValue.trim() || ''
      } else if (editingCell.field === 'amountReceived') {
        updateData.amountReceived = parseFloat(editValue) || 0
      } else if (editingCell.field === 'amountReceivable') {
        updateData.amountReceivable = parseFloat(editValue) || 0
      }

      await updateDoc(paymentRef, updateData)
      setLoading({ ...loading, saving: false })
      setEditingCell(null)
      setEditValue('')
      fetchPayments()
    } catch (error) {
      console.error('Error updating payment:', error)
      setLoading({ ...loading, saving: false })
      showModal('error', 'Error', 'Error updating payment. Please try again.')
      setEditingCell(null)
      setEditValue('')
    }
  }

  // Handle Enter key to save
  const handleCellKeyDown = async (e, payment) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    }
  }

  // Handle delete
  const handleDelete = (id) => {
    showModal(
      'warning',
      'Confirm Delete',
      'Are you sure you want to delete this payment?',
      async () => {
        setLoading({ ...loading, deleting: id })
        try {
          await deleteDoc(doc(db, 'payments', id))
          setLoading({ ...loading, deleting: null })
          showModal('success', 'Success', 'Payment deleted successfully!')
          fetchPayments()
        } catch (error) {
          console.error('Error deleting payment:', error)
          setLoading({ ...loading, deleting: null })
          showModal('error', 'Error', 'Error deleting payment. Please try again.')
        }
      },
      true
    )
  }

  // Handle delete all
  const handleDeleteAll = () => {
    showModal(
      'warning',
      'Confirm Delete All',
      'Are you sure you want to delete ALL payments? This action cannot be undone!',
      async () => {
        setLoading({ ...loading, deletingAll: true })
        try {
          const batchSize = 500 // Firestore batch limit
          const batches = []
          let currentBatch = writeBatch(db)
          let batchCount = 0

          for (let i = 0; i < payments.length; i++) {
            const payment = payments[i]
            currentBatch.delete(doc(db, 'payments', payment.id))
            batchCount++

            // Commit batch when it reaches the limit
            if (batchCount >= batchSize) {
              batches.push(currentBatch.commit())
              currentBatch = writeBatch(db)
              batchCount = 0
            }
          }

          // Commit remaining items in the last batch
          if (batchCount > 0) {
            batches.push(currentBatch.commit())
          }

          // Execute all batches in parallel
          await Promise.all(batches)
          setLoading({ ...loading, deletingAll: false })
          showModal('success', 'Success', 'All payments deleted successfully!')
          fetchPayments()
        } catch (error) {
          console.error('Error deleting all payments:', error)
          setLoading({ ...loading, deletingAll: false })
          showModal('error', 'Error', 'Error deleting payments. Please try again.')
        }
      },
      true
    )
  }

  // Normalize string for search (remove dots and spaces, convert to lowercase)
  const normalizeForSearch = (str) => {
    if (!str) return ''
    return str.toLowerCase().replace(/[.\s]/g, '')
  }

  // Filter payments based on search
  const filteredPayments = payments.filter(payment => {
    if (!searchTerm.trim()) return true
    
    const normalizedSearch = normalizeForSearch(searchTerm)
    const normalizedName = normalizeForSearch(payment.name)
    const normalizedPlace = normalizeForSearch(payment.place)
    
    return (
      normalizedName.includes(normalizedSearch) ||
      normalizedPlace.includes(normalizedSearch)
    )
  })

  // Calculate pagination
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex)

  // Pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page)
    // Scroll to top of table
    const tableSection = document.querySelector('.table-section')
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Handle name input change and show suggestions
  const handleNameChange = (e) => {
    const value = e.target.value
    setFormData({ ...formData, name: value })

    if (value.trim().length > 0) {
      // Get matching payments with name and place
      const matchingPayments = payments
        .filter(payment => 
          payment.name.toLowerCase().includes(value.toLowerCase()) &&
          payment.name.toLowerCase() !== value.toLowerCase()
        )
        .reduce((acc, payment) => {
          // Use name as key to get unique entries, keeping the first occurrence
          if (!acc.find(item => item.name.toLowerCase() === payment.name.toLowerCase())) {
            acc.push({
              name: payment.name,
              place: payment.place || ''
            })
          }
          return acc
        }, [])
        .slice(0, 5) // Limit to 5 suggestions

      setNameSuggestions(matchingPayments)
      setShowSuggestions(matchingPayments.length > 0)
    } else {
      setNameSuggestions([])
      setShowSuggestions(false)
    }
  }

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    setFormData({ 
      ...formData, 
      name: suggestion.name,
      place: suggestion.place || formData.place
    })
    setNameSuggestions([])
    setShowSuggestions(false)
  }

  // Handle Excel export
  const handleExcelExport = () => {
    try {
      // Prepare data for export
      const exportData = filteredPayments.map((payment, index) => {
        const balance = calculateBalance(payment.amountReceived, payment.amountReceivable || payment.amountGiven || 0)
        return {
          'S.No': index + 1,
          'Name': payment.name,
          'Place/Home': payment.place || '',
          'Amount Received': parseFloat(payment.amountReceived || 0).toFixed(2),
          'Amount Receivable': parseFloat(payment.amountReceivable || payment.amountGiven || 0).toFixed(2),
          'Balance': parseFloat(balance).toFixed(2)
        }
      })

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments')

      // Generate filename with current date
      const date = new Date().toISOString().split('T')[0]
      const filename = `wedding_payments_${date}.xlsx`

      // Write and download file
      XLSX.writeFile(workbook, filename)
      showModal('success', 'Success', 'Excel file exported successfully!')
    } catch (error) {
      console.error('Error exporting Excel file:', error)
      showModal('error', 'Error', 'Error exporting Excel file. Please try again.')
    }
  }

  return (
    <div className="app-container">
      <h1 className="app-title">Wedding Payment Management</h1>

      {/* Excel Upload Section */}
      <div className="upload-section">
        <label htmlFor="excel-upload" className={`upload-button ${loading.uploading ? 'loading' : ''}`} style={{ opacity: loading.uploading ? 0.7 : 1, cursor: loading.uploading ? 'not-allowed' : 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          {loading.uploading ? 'Uploading...' : 'Upload Excel File'}
        </label>
        <input
          id="excel-upload"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleExcelUpload}
          disabled={loading.uploading}
          style={{ display: 'none' }}
        />
        <p className="upload-instruction">
          Upload Excel with columns: Name, Place, Amount Received, Amount Receivable, Balance
        </p>
      </div>

      {/* Manual Input Form */}
      <div className={`form-section ${!isFormExpanded ? 'collapsed' : ''}`}>
        <div className="form-section-header" onClick={() => setIsFormExpanded(!isFormExpanded)}>
          <div className="form-section-title">
            <h2>Add Payment Entry</h2>
            <div className="plus-icon-circle">
              <svg 
                className="plus-icon"
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
          </div>
          <svg 
            className={`chevron-icon ${isFormExpanded ? 'expanded' : ''}`}
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div className={`form-content-wrapper ${isFormExpanded ? 'expanded' : 'collapsed'}`}>
          <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-row">
            <div className="form-group name-input-group">
              <label>Name *</label>
              <div className="name-input-wrapper">
                <input
                  type="text"
                  placeholder="Enter name"
                  value={formData.name}
                  onChange={handleNameChange}
                  onFocus={() => {
                    if (nameSuggestions.length > 0) {
                      setShowSuggestions(true)
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding suggestions to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200)
                  }}
                  required
                />
                {showSuggestions && nameSuggestions.length > 0 && (
                  <div className="name-suggestions-dropdown">
                    <div className="suggestions-header">Similar names found:</div>
                    {nameSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseDown={(e) => e.preventDefault()} // Prevent input blur
                      >
                        <div className="suggestion-name">{suggestion.name}</div>
                        {suggestion.place && (
                          <div className="suggestion-place">{suggestion.place}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Place/Home</label>
              <input
                type="text"
                placeholder="Enter place/home"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount Received *</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter amount received"
                value={formData.amountReceived}
                onChange={(e) => setFormData({ ...formData, amountReceived: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Amount Receivable (Optional)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter amount receivable"
                value={formData.amountReceivable}
                onChange={(e) => setFormData({ ...formData, amountReceivable: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="submit-button" disabled={loading.submitting}>
            {loading.submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        </div>
      </div>

      {/* Payment List Table */}
      <div className="table-section">
        <div className="table-header">
          <h2>Payment List</h2>
          <div className="table-header-actions">
            <div className="search-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search by name or place"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {filteredPayments.length > 0 && (
              <button onClick={handleExcelExport} className="export-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export to Excel
              </button>
            )}
            {payments.length > 0 && (
              <button onClick={handleDeleteAll} className="delete-all-button" disabled={loading.deletingAll}>
                {loading.deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            )}
          </div>
        </div>
        <div className="table-container">
          <table className="payment-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Name</th>
                <th>Place/Home</th>
                <th>Amount Received</th>
                <th>Amount Receivable</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">No payments found</td>
                </tr>
              ) : (
                paginatedPayments.map((payment, index) => {
                  const balance = calculateBalance(payment.amountReceived, payment.amountReceivable || payment.amountGiven || 0)
                  const balanceColor = getBalanceColor(balance)
                  const isEditingName = editingCell?.id === payment.id && editingCell?.field === 'name'
                  const isEditingPlace = editingCell?.id === payment.id && editingCell?.field === 'place'
                  const isEditingAmountReceived = editingCell?.id === payment.id && editingCell?.field === 'amountReceived'
                  const isEditingAmountReceivable = editingCell?.id === payment.id && editingCell?.field === 'amountReceivable'

                  return (
                    <tr key={payment.id}>
                      <td>{payment.sno}</td>
                      <td 
                        onClick={() => handleCellClick(payment, 'name')}
                        className="editable-cell"
                      >
                        {isEditingName ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(payment)}
                            onKeyDown={(e) => handleCellKeyDown(e, payment)}
                            className="edit-input edit-input-wide"
                            autoFocus
                          />
                        ) : (
                          capitalizeFirst(payment.name)
                        )}
                      </td>
                      <td 
                        onClick={() => handleCellClick(payment, 'place')}
                        className="editable-cell"
                      >
                        {isEditingPlace ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(payment)}
                            onKeyDown={(e) => handleCellKeyDown(e, payment)}
                            className="edit-input edit-input-wide"
                            autoFocus
                          />
                        ) : (
                          payment.place ? capitalizeFirst(payment.place) : '-'
                        )}
                      </td>
                      <td 
                        onClick={() => handleCellClick(payment, 'amountReceived')}
                        className="editable-cell"
                      >
                        {isEditingAmountReceived ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(payment)}
                            onKeyDown={(e) => handleCellKeyDown(e, payment)}
                            className="edit-input"
                            autoFocus
                          />
                        ) : (
                          `₹${parseFloat(payment.amountReceived || 0).toFixed(2)}`
                        )}
                      </td>
                      <td 
                        onClick={() => handleCellClick(payment, 'amountReceivable')}
                        className="editable-cell"
                      >
                        {isEditingAmountReceivable ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(payment)}
                            onKeyDown={(e) => handleCellKeyDown(e, payment)}
                            className="edit-input"
                            autoFocus
                          />
                        ) : (
                          `₹${parseFloat(payment.amountReceivable || payment.amountGiven || 0).toFixed(2)}`
                        )}
                      </td>
                      <td>
                        <span className={`balance balance-${balanceColor}`}>
                          ₹{formatBalance(balance)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {filteredPayments.length > itemsPerPage && (
          <div className="pagination-container">
            <div className="pagination-info">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredPayments.length)} of {filteredPayments.length} entries
            </div>
            <div className="pagination-controls">
              <button
                className="pagination-button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Previous
              </button>
              
              <div className="pagination-pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    )
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="pagination-ellipsis">...</span>
                  }
                  return null
                })}
              </div>
              
              <button
                className="pagination-button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Component */}
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
        showCancel={modal.showCancel}
      />
    </div>
  )
}

export default App

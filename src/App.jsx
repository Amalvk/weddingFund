import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore'
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
    amountGiven: ''
  })
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({
    name: '',
    place: '',
    amountReceived: '',
    amountGiven: ''
  })
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

  // Fetch payments from Firebase
  useEffect(() => {
    fetchPayments()
  }, [])

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
      const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'))
      const querySnapshot = await getDocs(q)
      const paymentsData = querySnapshot.docs.map((doc, index) => ({
        id: doc.id,
        sno: index + 1,
        ...doc.data()
      }))
      setPayments(paymentsData)
    } catch (error) {
      console.error('Error fetching payments:', error)
      showModal('error', 'Error', 'Error fetching payments. Please try again.')
    }
  }

  // Calculate balance
  const calculateBalance = (received, given) => {
    const receivedNum = parseFloat(received) || 0
    const givenNum = parseFloat(given) || 0
    return receivedNum - givenNum
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

        // Process and add each row to Firebase
        const promises = jsonData.map(async (row) => {
          const paymentData = {
            name: row.Name || row.name || '',
            place: row.Place || row.place || row['Place (optional)'] || '',
            amountReceived: parseFloat(row['Amount Received'] || row['Amount received'] || row.amountReceived || 0) || 0,
            amountGiven: parseFloat(row['Amount Given'] || row['Amount given'] || row.amountGiven || 0) || 0,
            createdAt: new Date()
          }

          if (paymentData.name) {
            return addDoc(collection(db, 'payments'), paymentData)
          }
          return null
        })

        await Promise.all(promises.filter(p => p !== null))
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
        amountGiven: parseFloat(formData.amountGiven) || 0,
        createdAt: new Date()
      }

      await addDoc(collection(db, 'payments'), paymentData)
      setLoading({ ...loading, submitting: false })
      showModal('success', 'Success', 'Payment added successfully!')
      setFormData({
        name: '',
        place: '',
        amountReceived: '',
        amountGiven: ''
      })
      fetchPayments()
    } catch (error) {
      console.error('Error adding payment:', error)
      setLoading({ ...loading, submitting: false })
      showModal('error', 'Error', 'Error adding payment. Please try again.')
    }
  }

  // Handle edit
  const handleEdit = (payment) => {
    setEditingId(payment.id)
    setEditData({
      name: payment.name,
      place: payment.place || '',
      amountReceived: payment.amountReceived.toString(),
      amountGiven: payment.amountGiven.toString()
    })
  }

  // Handle update
  const handleUpdate = async () => {
    setLoading({ ...loading, saving: true })
    try {
      const paymentRef = doc(db, 'payments', editingId)
      await updateDoc(paymentRef, {
        name: editData.name,
        place: editData.place || '',
        amountReceived: parseFloat(editData.amountReceived) || 0,
        amountGiven: parseFloat(editData.amountGiven) || 0
      })
      setLoading({ ...loading, saving: false })
      showModal('success', 'Success', 'Payment updated successfully!')
      setEditingId(null)
      fetchPayments()
    } catch (error) {
      console.error('Error updating payment:', error)
      setLoading({ ...loading, saving: false })
      showModal('error', 'Error', 'Error updating payment. Please try again.')
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
          const promises = payments.map(payment => deleteDoc(doc(db, 'payments', payment.id)))
          await Promise.all(promises)
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

  // Filter payments based on search
  const filteredPayments = payments.filter(payment => {
    const searchLower = searchTerm.toLowerCase()
    return (
      payment.name.toLowerCase().includes(searchLower) ||
      (payment.place && payment.place.toLowerCase().includes(searchLower))
    )
  })

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
          Upload Excel with columns: Name, Place (optional), Amount Received, Amount Given (optional)
        </p>
      </div>

      {/* Manual Input Form */}
      <div className="form-section">
        <h2>Add Payment Entry</h2>
        <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
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
              <label>Amount Given (Optional)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter amount given"
                value={formData.amountGiven}
                onChange={(e) => setFormData({ ...formData, amountGiven: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="submit-button" disabled={loading.submitting}>
            {loading.submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      </div>

      {/* Search Section */}
      <div className="search-section">
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
      </div>

      {/* Payment List Table */}
      <div className="table-section">
        <div className="table-header">
          <h2>Payment List</h2>
          {payments.length > 0 && (
            <button onClick={handleDeleteAll} className="delete-all-button" disabled={loading.deletingAll}>
              {loading.deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
          )}
        </div>
        <div className="table-container">
          <table className="payment-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Name</th>
                <th>Place/Home</th>
                <th>Amount Received</th>
                <th>Amount Given</th>
                <th>Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">No payments found</td>
                </tr>
              ) : (
                filteredPayments.map((payment, index) => {
                  if (editingId === payment.id) {
                    const editBalance = calculateBalance(editData.amountReceived, editData.amountGiven)
                    const editBalanceColor = getBalanceColor(editBalance)
                    
                    return (
                      <tr key={payment.id} className="edit-row">
                        <td>{index + 1}</td>
                        <td>
                          <input
                            type="text"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editData.place}
                            onChange={(e) => setEditData({ ...editData, place: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={editData.amountReceived}
                            onChange={(e) => setEditData({ ...editData, amountReceived: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={editData.amountGiven}
                            onChange={(e) => setEditData({ ...editData, amountGiven: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <span className={`balance balance-${editBalanceColor}`}>
                            ₹{formatBalance(editBalance)}
                          </span>
                        </td>
                        <td>
                          <button onClick={handleUpdate} className="action-button save-button" disabled={loading.saving}>
                            {loading.saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="action-button cancel-button" disabled={loading.saving}>Cancel</button>
                        </td>
                      </tr>
                    )
                  }

                  const balance = calculateBalance(payment.amountReceived, payment.amountGiven)
                  const balanceColor = getBalanceColor(balance)

                  return (
                    <tr key={payment.id}>
                      <td>{index + 1}</td>
                      <td>{payment.name}</td>
                      <td>{payment.place || '-'}</td>
                      <td>₹{parseFloat(payment.amountReceived || 0).toFixed(2)}</td>
                      <td>₹{parseFloat(payment.amountGiven || 0).toFixed(2)}</td>
                      <td>
                        <span className={`balance balance-${balanceColor}`}>
                          ₹{formatBalance(balance)}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleEdit(payment)} className="action-button edit-button">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(payment.id)} 
                          className="action-button delete-button"
                          disabled={loading.deleting === payment.id || loading.deletingAll}
                          title={loading.deleting === payment.id ? 'Deleting...' : 'Delete'}
                        >
                          {loading.deleting === payment.id ? (
                            <span style={{ fontSize: '12px' }}>Deleting...</span>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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

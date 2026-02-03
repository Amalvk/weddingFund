import './Modal.css'

const Modal = ({ isOpen, onClose, type = 'info', title, message, onConfirm, showCancel = false }) => {
  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="modal-icon success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        )
      case 'error':
        return (
          <svg className="modal-icon error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        )
      case 'warning':
        return (
          <svg className="modal-icon warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        )
      default:
        return (
          <svg className="modal-icon info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        )
    }
  }

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm()
    }
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={!showCancel ? onClose : undefined}>
      <div className={`modal-content modal-${type}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-container">
            {getIcon()}
          </div>
          {title && <h3 className="modal-title">{title}</h3>}
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          {showCancel ? (
            <>
              <button className="modal-button modal-button-cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button className={`modal-button modal-button-confirm modal-button-${type}`} onClick={handleConfirm}>
                Confirm
              </button>
            </>
          ) : (
            <button className={`modal-button modal-button-ok modal-button-${type}`} onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Modal


import React, { useEffect, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

// Borrowed from Dashboard to keep dropdowns consistent
const ADDRESS_OPTIONS = [
  {
    label: "Jaipur Facility",
    value: "Ganga Kaveri seeds Pvt Ltd\nC-110 , Road no 08\nVKI Area Jaipur -302013\nMob 8058888811\nGST no 08AAACG3220D1ZA"
  },
  {
    label: "Maktha Facility",
    value: "M/s Ganga Kaveri Seeds Pvt Ltd\nH.No:7-73, 7-74, 7-75, 7-75/1, 7-75/2, 7-75/3,\nVill:Maktha,\nMolangur,\nShankarapatnam,\nDist: Karimnagar,\nState: Telangana,\nPIN:505470,\nMobile: 9866343771"
  },
  {
    label: "Medchal Facility",
    value: "Ganga Kaveri Seeds pvt Ltd\nc/o Sunanda Farm,\nS no: 115/116,\nKandlakoya,\nMedchal,malkajrigi,\nNear by Oxygen Park OPP ,\npin no :501401"
  },
  {
    label: "Gajwel Facility",
    value: "Gangakaveri seeds Pvt.Ltd ,\nVil : Kodakandla,\nMndl : Gajwel,\nDist : Siddipet,\nPincode : 502312"
  }
];

const SVSBatchHistory = () => {
  const [products, setProducts] = useState([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Modal states
  const [editProduct, setEditProduct] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null); // Custom confirmation popup

  // ── Toast Notification State ──
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3500);
  };

  const fetchStats = async (currentSkip = 0, currentLimit = 20, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      const token = localStorage.getItem('svs_token');
      const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/admin/stats?skip=${currentSkip}&limit=${currentLimit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (isInitial) {
        setProducts(data.products);
      } else {
        setProducts(prev => [...prev, ...data.products]);
      }

      setHasMore(data.hasMore);
      setSkip(currentSkip + currentLimit);
    } catch (err) {
      showToast("Failed to load history data.", "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { 
    fetchStats(0, 20, true); 
  }, []);

  const handleLoadMore = () => {
    fetchStats(skip, 40, false);
  };

  // Triggers the custom popup
  const promptDelete = (productId) => {
    setDeleteConfirmId(productId);
  };

  // Executes the actual deletion
  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const token = localStorage.getItem('svs_token');
      await axios.delete(`${import.meta.env.VITE_BACKEND_URL}/api/admin/product/${deleteConfirmId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      showToast("Batch deleted successfully", "success");
      setDeleteConfirmId(null);
      fetchStats(0, skip || 20, true);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to delete batch";
      showToast(errorMsg, "error");
      setDeleteConfirmId(null);
    }
  };

  const handleEditChange = (field, value) => {
    let updated = { ...editProduct, [field]: value };
    
    // Auto-calculate USP if MRP or NetQty changes
    if (field === 'mrp' || field === 'netQty') {
      const mrpVal = parseFloat(String(updated.mrp).replace(/[^0-9.]/g, ''));
      const netQtyVal = parseFloat(String(updated.netQty).replace(/[^0-9.]/g, ''));
      if (!isNaN(mrpVal) && !isNaN(netQtyVal) && netQtyVal > 0) {
        updated.unitSalePrice = `Rs ${(mrpVal / netQtyVal).toFixed(2)} / Kg`;
      }
    }
    setEditProduct(updated);
  };

  const getAddressIndex = (addressString) => {
    const index = ADDRESS_OPTIONS.findIndex(opt => opt.value === addressString);
    return index !== -1 ? index : 0;
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('svs_token');
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/admin/product/${editProduct._id}`, {
        cropName: editProduct.cropName,
        packedVariety: editProduct.packedVariety,
        mrp: editProduct.mrp,
        unitSalePrice: editProduct.unitSalePrice,
        netQty: editProduct.netQty,
        plantAddress: editProduct.plantAddress,
        dateOfTesting: editProduct.dateOfTesting,
        dateOfPackaging: editProduct.dateOfPackaging,
        dateOfExpiry: editProduct.dateOfExpiry
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      showToast("Product updated successfully!", "success");
      setEditProduct(null);
      fetchStats(0, skip || 20, true);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to update product";
      showToast(errorMsg, "error");
    }
  };

  const downloadExcel = async () => {
    try {
      showToast("Compiling all records... Please wait.", "success");
      
      const token = localStorage.getItem('svs_token');
      const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/admin/stats?all=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const rows = data.products.map(p => ({
        "Date": p.dateOfPackaging || "Unknown",
        "Lot Number": p.packedLotNumber || "N/A",
        "Crop Name": p.cropName || "Unknown",
        "Variety": p.packedVariety || "Unknown",
        "Label Range": p.labelRange || "Random",
        "Bags Produced": p.quantity || 0,
        "MRP": p.mrp || "N/A",
        "Unit Sale Price": p.unitSalePrice || "N/A",
        "Net Quantity": p.netQty || "N/A"
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Production_Logs");
      XLSX.writeFile(workbook, `gangakaveri_Seeds_Production_${new Date().toLocaleDateString()}.xlsx`);
      
      showToast("Excel downloaded successfully!", "success");
    } catch (err) {
      showToast("Failed to generate Excel download.", "error");
    }
  };

  const groupedStatsMap = products.reduce((acc, p) => {
    const date = p.dateOfPackaging || "Unknown Date";
    if (!acc[date]) acc[date] = { _id: date, products: [] };
    acc[date].products.push(p);
    return acc;
  }, {});
  
  const stats = Object.values(groupedStatsMap).sort((a, b) => new Date(b._id) - new Date(a._id));

  return (
    <>
      <style>{`
        /* ── TOAST NOTIFICATION CSS ── */
        .svsd-toast {
          position: fixed; bottom: 30px; left: 30px;
          background: #111d14; color: white; padding: 16px 20px; border-radius: 8px;
          box-shadow: 0 10px 40px rgba(17,29,20,0.4); z-index: 10000; display: flex; flex-direction: column; gap: 12px;
          transform: translateX(-150%); transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          overflow: hidden; min-width: 320px;
        }
        .svsd-toast.show { transform: translateX(0); }
        .svsd-toast-message { font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 12px; }
        .svsd-toast-bar-wrap { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; width: 100%; overflow: hidden; }
        .svsd-toast-bar { height: 100%; background: #1bba6b; width: 100%; transform-origin: left; }
        .svsd-toast.error .svsd-toast-bar { background: #e74c3c; }
        .svsd-toast.error .svsd-toast-icon { color: #e74c3c; }
        .svsd-toast.success .svsd-toast-icon { color: #1bba6b; }
        @keyframes shrinkToastBar { from { width: 100%; } to { width: 0%; } }
        .svsd-toast.show .svsd-toast-bar { animation: shrinkToastBar 3.5s linear forwards; }
        
        /* ════════════════════════════════
           BATCH HISTORY ROOT
        ════════════════════════════════ */
        .svsbh-root { max-width: 1150px; margin: 36px auto 0; padding: 0 28px 80px; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
        .svsbh-card { background: #ffffff; border-radius: 10px; border: 1px solid #d4e0d8; box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 6px rgba(17,29,20,0.04), 0 16px 48px rgba(17,29,20,0.08); overflow: hidden; }
        .svsbh-card-stripe { height: 3px; background: #1bba6b; }
        .svsbh-header { display: flex; justify-content: space-between; align-items: center; padding: 22px 28px 20px; border-bottom: 1px solid #d4e0d8; background: #f7faf8; gap: 16px; flex-wrap: wrap; }
        .svsbh-header-left { display: flex; align-items: center; gap: 14px; }
        .svsbh-header-icon { width: 40px; height: 40px; border-radius: 8px; background: rgba(27,186,107,0.08); border: 1px solid rgba(27,186,107,0.20); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .svsbh-header-icon svg { width: 17px; height: 17px; color: #1bba6b; }
        .svsbh-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 20px; font-weight: 400; color: #111d14; letter-spacing: -0.3px; margin: 0; }
        .svsbh-subtitle { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: #7a9180; margin-top: 3px; }

        .svsbh-download-btn { display: flex; align-items: center; gap: 8px; background: #111d14; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; box-shadow: 0 3px 14px rgba(17,29,20,0.28); transition: background 0.18s, transform 0.15s, box-shadow 0.18s; position: relative; overflow: hidden; }
        .svsbh-download-btn:hover { background: #1bba6b; transform: translateY(-1px); box-shadow: 0 6px 22px rgba(27,186,107,0.35); }

        .svsbh-body { padding: 24px 28px; }
        .svsbh-loading { text-align: center; padding: 56px 20px; }
        .svsbh-loading-text { font-size: 13px; color: #7a9180; letter-spacing: 0.2px; }
        .svsbh-empty { text-align: center; padding: 64px 20px; }
        .svsbh-empty-title { font-family: 'DM Serif Display', serif; font-size: 17px; color: #3d5245; margin-bottom: 6px; }

        .svsbh-day-group { margin-bottom: 30px; }
        .svsbh-day-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e6ede8; }
        .svsbh-day-badge { display: flex; align-items: center; gap: 7px; background: #111d14; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; padding: 5px 11px; border-radius: 4px; }
        .svsbh-day-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: #1bba6b; box-shadow: 0 0 5px rgba(27,186,107,0.65); }
        .svsbh-day-label-text { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #7a9180; }
        .svsbh-day-line { flex: 1; height: 1px; background: linear-gradient(90deg, #d4e0d8, transparent); }

        .svsbh-table-wrap { border-radius: 7px; border: 1px solid #d4e0d8; overflow-x: auto; box-shadow: 0 1px 4px rgba(17,29,20,0.04); }
        .svsbh-table { width: 100%; border-collapse: collapse; text-align: left; min-width: 1050px; }
        .svsbh-thead tr { background: #f2f6f3; }
        .svsbh-th { padding: 11px 16px; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #3d5245; border-bottom: 2px solid #d4e0d8; white-space: nowrap; }
        .svsbh-tr { border-bottom: 1px solid #eaf0ec; transition: background 0.10s; }
        .svsbh-tr:hover { background: #f2f6f3; }
        .svsbh-td { padding: 12px 16px; font-size: 13px; color: #111d14; vertical-align: middle; }
        .svsbh-td-bold { font-weight: 600; color: #111d14; }
        .svsbh-td-muted { font-family: 'JetBrains Mono', monospace; color: #7a9180; font-size: 11px; }
        .svsbh-bag-pill { display: inline-flex; align-items: center; padding: 3px 10px; background: rgba(27,186,107,0.08); border: 1px solid rgba(27,186,107,0.22); border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #1d4528; }

        .svsbh-actions { display: flex; gap: 7px; align-items: center; }
        .svsbh-edit-btn, .svsbh-delete-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.15s; }
        .svsbh-edit-btn { background: rgba(240,190,61,0.08); color: #7a6320; border: 1px solid rgba(240,190,61,0.35); }
        .svsbh-delete-btn { background: rgba(229,62,62,0.06); color: #9b1c1c; border: 1px solid rgba(229,62,62,0.24); }

        .svsbh-footer-actions { display: flex; justify-content: center; padding-top: 10px; margin-top: 10px; }
        .svsbh-load-more-btn { background: #f2f6f3; border: 1px solid #d4e0d8; color: #3d5245; padding: 10px 24px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .svsbh-load-more-btn:hover:not(:disabled) { background: #eaf0ec; border-color: #c0d0c5; }
        .svsbh-load-more-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* MODALS */
        .svsbh-overlay { position: fixed; inset: 0; background: rgba(10,20,12,0.72); backdrop-filter: blur(5px); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 20px; }
        @keyframes svsbhFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .svsbh-modal { background: #ffffff; border-radius: 10px; width: 100%; max-width: 600px; box-shadow: 0 32px 80px rgba(0,0,0,0.45); border: 1px solid #d4e0d8; overflow: hidden; animation: svsbhSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .svsbh-modal-sm { max-width: 400px; }
        @keyframes svsbhSlideUp { from { transform: translateY(24px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        
        .svsbh-modal-stripe { height: 3px; background: #1bba6b; }
        .svsbh-modal-stripe.danger { background: #e53e3e; }
        .svsbh-modal-header { padding: 20px 24px 18px; background: #111d14; display: flex; align-items: center; gap: 12px; }
        .svsbh-modal-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 18px; color: #fff; margin: 0; }
        .svsbh-modal-subtitle { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: rgba(27,186,107,0.55); margin-top: 3px; }
        
        .svsbh-modal-body { padding: 22px 24px 8px; }
        .svsbh-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
        
        .svsbh-modal-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #3d5245; margin-bottom: 6px; }
        .svsbh-modal-input { width: 100%; padding: 11px 14px; margin-bottom: 16px; border: 1.5px solid #c0d0c5; border-radius: 6px; font-size: 14px; background: #f7faf8; outline: none; }
        .svsbh-modal-input:focus:not([readOnly]) { border-color: #1bba6b; box-shadow: 0 0 0 3px rgba(27,186,107,0.12); background: #fff; }
        .svsbh-modal-input[readOnly] { background: #eaf0ec; color: #7a9180; cursor: not-allowed; border-color: #d4e0d8; }
        
        .svsbh-modal-footer { display: flex; gap: 10px; padding: 8px 24px 24px; }
        .svsbh-save-btn, .svsbh-cancel-btn { flex: 1; padding: 13px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; border: none; }
        .svsbh-save-btn { background: #1bba6b; color: #fff; }
        .svsbh-save-btn.danger { background: #e53e3e; }
        .svsbh-cancel-btn { background: transparent; color: #3d5245; border: 1.5px solid #d4e0d8; }
      `}</style>

      {/* ── TOAST NOTIFICATION ── */}
      <div className={`svsd-toast ${toast.type} ${toast.visible ? 'show' : ''}`}>
        <div className="svsd-toast-message">
          {toast.type === 'success' ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          )}
          {toast.message}
        </div>
        <div className="svsd-toast-bar-wrap">
          <div className="svsd-toast-bar"></div>
        </div>
      </div>

      <div className="svsbh-root">
        <div className="svsbh-card">
          <div className="svsbh-card-stripe" />

          <div className="svsbh-header">
            <div className="svsbh-header-left">
              <div className="svsbh-header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </div>
              <div>
                <h2 className="svsbh-title">Daily Production Monitor</h2>
                <div className="svsbh-subtitle">Batch History &amp; Records</div>
              </div>
            </div>
            <button onClick={downloadExcel} className="svsbh-download-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Excel
            </button>
          </div>

          <div className="svsbh-body">
            {loading ? (
              <div className="svsbh-loading"><div className="svsbh-loading-text">Loading production data…</div></div>
            ) : stats.length === 0 ? (
              <div className="svsbh-empty">
                <div className="svsbh-empty-title">No production batches found</div>
                <div className="svsbh-empty-sub">Generate a batch above to see records here</div>
              </div>
            ) : (
              <>
                {stats.map((day, index) => (
                  <div key={index} className="svsbh-day-group">
                    <div className="svsbh-day-header">
                      <div className="svsbh-day-badge">
                        <div className="svsbh-day-badge-dot" />
                        {day._id || "Unknown Date"}
                      </div>
                      <span className="svsbh-day-label-text">Batch Group</span>
                      <div className="svsbh-day-line" />
                    </div>

                    <div className="svsbh-table-wrap">
                      <table className="svsbh-table">
                        <thead className="svsbh-thead">
                          <tr>
                            <th className="svsbh-th">Date</th>
                            <th className="svsbh-th">Lot No</th>
                            <th className="svsbh-th">Crop Name</th>
                            <th className="svsbh-th">Variety</th>
                            <th className="svsbh-th">Label Range</th>
                            <th className="svsbh-th">Bags</th>
                            <th className="svsbh-th">MRP</th>
                            <th className="svsbh-th">USP</th>
                            <th className="svsbh-th">Net Qty</th>
                            <th className="svsbh-th">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.products.map((p, i) => (
                            <tr key={i} className="svsbh-tr">
                              <td className="svsbh-td svsbh-td-muted">{p.dateOfPackaging || day._id}</td>
                              <td className="svsbh-td svsbh-td-muted">{p.packedLotNumber || "N/A"}</td>
                              <td className="svsbh-td svsbh-td-bold">{p.cropName || "Unknown"}</td>
                              <td className="svsbh-td">{p.packedVariety || "Unknown"}</td>
                              <td className="svsbh-td svsbh-td-muted" style={{ color: '#1bba6b' }}>
                                {p.labelRange || "Random"}
                              </td>
                              <td className="svsbh-td">
                                <span className="svsbh-bag-pill">{p.quantity || 0}</span>
                              </td>
                              <td className="svsbh-td">{p.mrp || "N/A"}</td>
                              <td className="svsbh-td">{p.unitSalePrice || "N/A"}</td>
                              <td className="svsbh-td">{p.netQty || "N/A"}</td>
                              <td className="svsbh-td">
                                <div className="svsbh-actions">
                                  <button onClick={() => setEditProduct({...p, plantAddress: p.plantAddress || ADDRESS_OPTIONS[1].value})} className="svsbh-edit-btn">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Edit
                                  </button>
                                  <button onClick={() => promptDelete(p._id)} className="svsbh-delete-btn">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                
                {hasMore && (
                  <div className="svsbh-footer-actions">
                    <button onClick={handleLoadMore} className="svsbh-load-more-btn" disabled={loadingMore}>
                      {loadingMore ? 'Loading Data...' : 'Load Next 40 Batches'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CUSTOM DELETE CONFIRMATION MODAL ── */}
      {deleteConfirmId && (
        <div className="svsbh-overlay">
          <div className="svsbh-modal svsbh-modal-sm">
            <div className="svsbh-modal-stripe danger" />
            <div className="svsbh-modal-header" style={{ background: '#2C1212' }}>
              <div>
                <h3 className="svsbh-modal-title" style={{ color: '#FC8181' }}>Delete Batch?</h3>
                <div className="svsbh-modal-subtitle" style={{ color: '#E53E3E' }}>Permanent Action</div>
              </div>
            </div>
            <div className="svsbh-modal-body">
              <p style={{ fontSize: '13px', color: '#3d5245', lineHeight: '1.6', marginBottom: '8px' }}>
                Are you absolutely sure you want to completely remove this batch?
              </p>
              <p style={{ fontSize: '12px', color: '#e53e3e', fontWeight: '600' }}>
                This will permanently invalidate all associated QR labels. This action cannot be undone.
              </p>
            </div>
            <div className="svsbh-modal-footer">
              <button onClick={executeDelete} className="svsbh-save-btn danger">Yes, Delete Batch</button>
              <button onClick={() => setDeleteConfirmId(null)} className="svsbh-cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editProduct && (
        <div className="svsbh-overlay">
          <div className="svsbh-modal">
            <div className="svsbh-modal-stripe" />
            <div className="svsbh-modal-header">
              <div>
                <h3 className="svsbh-modal-title">Edit Batch Details</h3>
                <div className="svsbh-modal-subtitle">Update product information</div>
              </div>
            </div>
            <form onSubmit={handleEditSave}>
              <div className="svsbh-modal-body">
                
                <div className="svsbh-modal-grid">
                  <div>
                    <label className="svsbh-modal-label">Crop Name</label>
                    <input className="svsbh-modal-input" value={editProduct.cropName || ''} onChange={(e) => handleEditChange('cropName', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">Variety</label>
                    <input className="svsbh-modal-input" value={editProduct.packedVariety || ''} onChange={(e) => handleEditChange('packedVariety', e.target.value)} required />
                  </div>
                  
                  <div>
                    <label className="svsbh-modal-label">Date of Testing</label>
                    <input type="date" className="svsbh-modal-input" value={editProduct.dateOfTesting || ''} onChange={(e) => handleEditChange('dateOfTesting', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">Packaging Date</label>
                    <input type="date" className="svsbh-modal-input" value={editProduct.dateOfPackaging || ''} onChange={(e) => handleEditChange('dateOfPackaging', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">Date of Expiry</label>
                    <input type="date" className="svsbh-modal-input" value={editProduct.dateOfExpiry || ''} onChange={(e) => handleEditChange('dateOfExpiry', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">MRP</label>
                    <input className="svsbh-modal-input" value={editProduct.mrp || ''} onChange={(e) => handleEditChange('mrp', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">Net Quantity</label>
                    <input className="svsbh-modal-input" value={editProduct.netQty || ''} onChange={(e) => handleEditChange('netQty', e.target.value)} required />
                  </div>
                  <div>
                    <label className="svsbh-modal-label">Unit Sale Price (Auto-calculated)</label>
                    {/* USP IS NOW READ ONLY */}
                    <input className="svsbh-modal-input" value={editProduct.unitSalePrice || ''} readOnly />
                  </div>
                </div>

                <div style={{ marginTop: '4px' }}>
                  <label className="svsbh-modal-label">Plant Address</label>
                  <select 
                    className="svsbh-modal-input" 
                    value={getAddressIndex(editProduct.plantAddress)} 
                    onChange={(e) => handleEditChange('plantAddress', ADDRESS_OPTIONS[e.target.value].value)} 
                    required
                  >
                    {ADDRESS_OPTIONS.map((opt, i) => <option key={i} value={i}>{opt.label}</option>)}
                  </select>
                </div>
                
              </div>
              <div className="svsbh-modal-footer">
                <button type="submit" className="svsbh-save-btn">Save Changes</button>
                <button type="button" onClick={() => setEditProduct(null)} className="svsbh-cancel-btn">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SVSBatchHistory;
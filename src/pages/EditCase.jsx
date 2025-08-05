import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";



function EditCasePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const caseDataFromLocation = location.state?.caseData || null;
  const docIdFromLocation = location.state?.docId || null;

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(caseDataFromLocation);

  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [status, setStatus] = useState("not started");
  const [urgency, setUrgency] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/"); // Redirect to landing page
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };


  useEffect(() => {
    const fetchCase = async (id) => {
      try {
        const res = await axios.get("${import.meta.env.VITE_API_URL}/cases/search", { params: {} });
        const allCases = res.data.cases;
        const found = allCases.find((c) => c.doc_id === id);
        if (found) setCaseData(found);
      } catch (err) {
        console.error("Failed to fetch case by ID:", err);
      } finally {
        setLoading(false);
      }
    };

    if (!caseDataFromLocation && docIdFromLocation) {
      fetchCase(docIdFromLocation);
    } else {
      setLoading(false);
    }
  }, [caseDataFromLocation, docIdFromLocation]);

  useEffect(() => {
    if (caseData) {
      setCaseNumber(caseData.caseNumber || "");
      setCaseTitle(caseData.caseTitle || "");
      setDateOfIncident(caseData.dateOfIncident?.split("T")[0] || "");
      setRegion(caseData.region || "");
      setBetween(caseData.between || "");
      setStatus(caseData.status || "not started");
      setUrgency(caseData.urgency || "");
    }
  }, [caseData]);

  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.put("${import.meta.env.VITE_API_URL}/cases/update", {
        doc_id: caseData?.doc_id || docIdFromLocation,
        caseNumber,
        caseTitle,
        dateOfIncident,
        region,
        between,
        status,
        urgency,
      });

      if (response.data.success) {
        alert("Case updated successfully!");
        navigate("/home");
      } else {
        alert("Update failed: " + response.data.message);
      }
    } catch (error) {
      console.error("Error updating case:", error);
      alert("An error occurred during update.");
    }
  };

  if (loading) return <div className="text-white p-4">Loading case...</div>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
  
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          {/* Hamburger Icon */}
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
  
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
  
        <h1 className="text-xl font-bold text-white">Edit Case</h1>
  
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>
  
      {/* Hamburger Menu Content */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
          <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 My Cases</Link>
  
          {profile?.role === "admin" && (
            <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
              🛠 Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleUpdate} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Case Number *</label>
            <input type="text" value={caseNumber} readOnly className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Case Title *</label>
            <input type="text" value={caseTitle} readOnly className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Date of Incident *</label>
            <input type="date" value={dateOfIncident} readOnly className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Region *</label>
            <select value={region} disabled className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white cursor-not-allowed">
              <option value="">Select a region</option>
              <option value="western-cape">Western Cape</option>
              <option value="eastern-cape">Eastern Cape</option>
              <option value="northern-cape">Northern Cape</option>
              <option value="gauteng">Gauteng</option>
              <option value="kwazulu-natal">KwaZulu-Natal</option>
              <option value="free-state">Free State</option>
              <option value="mpumalanga">Mpumalanga</option>
              <option value="limpopo">Limpopo</option>
              <option value="north-west">North West</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Between</label>
            <input type="text" value={between} readOnly className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white cursor-not-allowed" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Urgency *</label>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} required className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white">
              <option value="">Select urgency level</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Status *</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            required
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
          >
            <option value="not started">Not Started</option>
            <option value="in progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

          <div className="flex justify-between mt-10">
            <Link to="/home" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">Cancel</Link>
            <button type="submit" className="px-4 py-2 rounded text-white bg-blue-700 hover:bg-blue-600">Save Changes</button>
          </div>
        </form>

          <div className="flex justify-between mt-10">
            <div className="flex gap-4">
              <button
                type="button"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
                onClick={() => {
                  localStorage.setItem(
                    "trackxCaseData",
                    JSON.stringify({
                      caseId: caseData?.doc_id || docIdFromLocation,
                      caseNumber: caseNumber,
                      caseTitle: caseTitle,
                    })
                  );
                  window.open("/simulation", "_blank");
                }}
              >
                View Simulation
              </button>
            </div>
          </div>
          
      </div>
    </motion.div>
  );
}

export default EditCasePage;

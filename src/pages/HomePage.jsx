import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar
} from "recharts";
import adfLogo from "../assets/image-removebg-preview.png"; 
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import GlobeBackground from "../components/GlobeBackground"; 
import { auth } from "../firebase"; 
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";

function HomePage() {
    const [clearMode, setClearMode] = useState(false); 
    const [showMenu, setShowMenu] = useState(false);
    const [recentCases, setRecentCases] = useState([]);
    const [statusStats, setStatusStats] = useState({ "not started": 0, "in progress": 0, completed: 0 });
    const { profile } = useAuth();
    const navigate = useNavigate(); 
    const [monthlyCaseCounts, setMonthlyCaseCounts] = useState([]);
    const [regionCounts, setRegionCounts] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [globePoints, setGlobePoints] = useState([]);
    const [sortBy, setSortBy] = useState("dateEntered");
    const [isLoading, setIsLoading] = useState(true);
    
    // 🚀 PERFORMANCE FIX 1: Prevent multiple fetches with ref
    const hasFetchedRef = useRef(false);
    const profileIdRef = useRef(null);

    // 🚀 PERFORMANCE FIX 2: Memoize constants
    const COLORS = useMemo(() => ["#B91C1C", "#1E40AF", "#059669"], []);
    const BLUE = "#1E40AF";

    // 🚀 PERFORMANCE FIX 3: Memoize pie chart data
    const pieData = useMemo(() => [
      { name: "Not Started", value: statusStats["not started"] },
      { name: "In Progress", value: statusStats["in progress"] },
      { name: "Completed", value: statusStats.completed },
    ], [statusStats]);

    // For Sign Out functionality
    const handleSignOut = useCallback(async () => {
      try {
        await signOut(auth);
        navigate("/");
      } catch (error) {
        console.error("Sign-out failed:", error.message);
      }
    }, [navigate]);

    // 🚀 PERFORMANCE FIX 4: Memoized data fetching function
    const fetchAllData = useCallback(async () => {
      if (!profile?.userID || hasFetchedRef.current || profileIdRef.current === profile.userID) {
        return; // Prevent duplicate fetches
      }
      
      hasFetchedRef.current = true;
      profileIdRef.current = profile.userID;
      setIsLoading(true);
      
      console.log("🚀 Starting SINGLE optimized data fetch...");
      
      try {
        // Prepare parameters based on user role
        const userParams = profile?.role === "admin" ? {} : { user_id: profile.userID };
        const recentCasesParams = {
          sortBy,
          ...(profile?.role !== "admin" && profile?.userID ? { user_id: profile.userID } : {})
        };

        // Execute ALL API calls in parallel for maximum speed
        const [
          recentCasesRes,
          allCasesRes,
          monthlyCountsRes,
          regionCountsRes,
          heatPointsRes,
          globePointsRes
        ] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL}/cases/recent`, { params: recentCasesParams }),
          axios.get(`${import.meta.env.VITE_API_URL}/cases/search`, { params: userParams }),
          axios.get(`${import.meta.env.VITE_API_URL}/cases/monthly-counts`, { params: userParams }),
          axios.get(`${import.meta.env.VITE_API_URL}/cases/region-counts`, { params: userParams }),
          axios.get(`${import.meta.env.VITE_API_URL}/cases/all-points`),
          axios.get(`${import.meta.env.VITE_API_URL}/cases/last-points`).catch(() => ({ data: { points: [] } }))
        ]);

        // Process all responses
        console.log("🆕 Recent cases:", recentCasesRes.data.cases);
        setRecentCases(recentCasesRes.data.cases);

        // Process case status stats
        const allCases = allCasesRes.data.cases || [];
        const notStarted = allCases.filter((c) => c.status === "not started").length;
        const inProgress = allCases.filter((c) => c.status === "in progress").length;
        const completed = allCases.filter((c) => c.status === "completed").length;
        setStatusStats({ "not started": notStarted, "in progress": inProgress, completed });

        console.log("📊 Monthly counts:", monthlyCountsRes.data.counts);
        setMonthlyCaseCounts(monthlyCountsRes.data.counts);

        console.log("🗺 Region counts:", regionCountsRes.data.counts);
        setRegionCounts(regionCountsRes.data.counts || []);

        console.log("🔥 Heat points:", heatPointsRes.data.points);
        setHeatPoints(heatPointsRes.data.points || []);

        console.log("🌍 Globe points:", globePointsRes.data.points);
        setGlobePoints(globePointsRes.data.points || []);

        console.log("✅ Single data fetch completed!");

      } catch (error) {
        console.error("❌ Failed to fetch homepage data:", error);
        // Reset fetch flag on error to allow retry
        hasFetchedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    }, [profile?.userID, profile?.role, sortBy]);

    // 🚀 PERFORMANCE FIX 5: Optimized useEffect with better dependencies
    useEffect(() => {
      if (profile?.userID && !hasFetchedRef.current) {
        fetchAllData();
      }
    }, [fetchAllData]);

    // 🚀 PERFORMANCE FIX 6: Separate useEffect for sort changes (only refetch recent cases)
    useEffect(() => {
      const refetchRecentCases = async () => {
        if (!profile?.userID || !hasFetchedRef.current) return;
        
        try {
          const recentCasesParams = {
            sortBy,
            ...(profile?.role !== "admin" && profile?.userID ? { user_id: profile.userID } : {})
          };
          
          const recentCasesRes = await axios.get(`${import.meta.env.VITE_API_URL}/cases/recent`, { params: recentCasesParams });
          setRecentCases(recentCasesRes.data.cases);
          console.log("🔄 Recent cases refetched for sort change");
        } catch (error) {
          console.error("❌ Failed to refetch recent cases:", error);
        }
      };

      if (hasFetchedRef.current) {
        refetchRecentCases();
      }
    }, [sortBy, profile?.userID, profile?.role]);

    // 🚀 PERFORMANCE FIX 7: Reset fetch flag when profile changes significantly
    useEffect(() => {
      if (profile?.userID && profileIdRef.current !== profile.userID) {
        hasFetchedRef.current = false;
        profileIdRef.current = null;
      }
    }, [profile?.userID]);

    // Show loading state
    if (isLoading || !profile) {
      return (
        <div className="relative flex flex-col min-h-screen">
          <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black" />
          <div className="flex items-center justify-center min-h-screen relative z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300 text-lg">Loading TrackX Dashboard...</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex flex-col min-h-screen">
      {/* Gradient background that grows properly */}
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />
        {/*  Globe Background */}
        <GlobeBackground interactive={clearMode} globePoints={globePoints} />
   
        {/*  Clear Button */}
        <div className="absolute top-20 right-4 z-20">
          <button
            onClick={() => setClearMode(!clearMode)}
            className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
          >
            {clearMode ? "Back to Dashboard" : "Clear (Explore Globe)"}
          </button>
        </div>
  
        {/* Main Content (hidden when clearMode is true) */}
        {!clearMode && (
          <div className="flex-grow flex flex-col relative z-10">
            {/* 🟦 Navbar */}
            <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans">
              <div className="flex items-center space-x-4">
              <div
                className="text-white text-3xl cursor-pointer"
                onClick={() => setShowMenu(!showMenu)}
              >
                &#9776;
              </div>
                <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
              </div>
  
              <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans flex items-center space-x-2">
                <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto" />
                <span>TRACKX</span>
                <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto" />
              </div>
  
              <div className="flex items-center space-x-6 text-white font-sans">
                <Link to="/home" className="hover:text-gray-300">Home</Link>
                <div className="flex flex-col text-right">
                  <span className="text-white">{profile ? profile.firstName : "Loading..."}</span>
                  <button onClick={handleSignOut} className="text-sm text-gray-300 hover:text-white">Sign Out</button>
                </div>
                <div className="text-sm text-gray-300">
                  {new Date().toLocaleString()}
                </div>
              </div>
            </nav>
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
  
            {/*Slogan */}
            <div className="text-center text-gray-300 text-lg tracking-wide mt-4 font-sans">
              Let's track the case
            </div>
  
            {/* Main Content */}
            <main className="flex flex-col items-center justify-center w-full p-8 space-y-10">
              {/* Two main charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
              <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg text-blue-500 mb-4 font-semibold">Resolution Status</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg text-blue-500 mb-4 font-semibold">Case Distribution Over Time</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={monthlyCaseCounts} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="month" stroke="#ccc" />
                    <YAxis stroke="#ccc" allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke={BLUE} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
  
            {/* Recent Cases */}
            <div className="w-full max-w-4xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-blue-500">Recent Cases</h2>
              <div className="flex gap-6 mb-4 text-white">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={sortBy === "dateEntered"}
                    onChange={() => setSortBy("dateEntered")}
                  />
                  <span>Date Entered</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={sortBy === "dateOfIncident"}
                    onChange={() => setSortBy("dateOfIncident")}
                  />
                  <span>Date of Incident</span>
                </label>
              </div>
              <ul className="space-y-4">
                {recentCases.length > 0 ? (
                  recentCases.map((caseItem, index) => (
                    <li key={index} className="flex justify-between items-center border-b border-gray-700 pb-2">
                      <span className="text-gray-300">{caseItem.caseTitle}</span>
                      <Link
                        to="/edit-case"
                        state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                        className="text-sm border border-gray-300 text-white py-1 px-3 rounded hover:bg-blue-800 hover:text-white transition-colors duration-200"
                      >
                        Manage
                      </Link>
                    </li>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm">No recent cases available.</p>
                )}
              </ul>
            </div>
  
              {/* Create New Case Button */}
              <Link
                to="/new-case"
                className="flex items-center border border-blue-800 text-blue-800 font-bold py-3 px-6 rounded-full shadow hover:bg-blue-800 hover:text-white transition-colors duration-200"
              >
                <span className="text-2xl mr-2">＋</span> Create New Case / Report
              </Link>
  
              {/* Dashboard Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl mt-10">
                {/* Bar Chart */}
                  <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                    <h3 className="text-lg text-blue-500 mb-4 font-semibold">Case Frequency by Region</h3>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={regionCounts} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis dataKey="region" stroke="#ccc" />
                        <YAxis stroke="#ccc" allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill={BLUE} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
  
                {/* Map Visualization */}
                <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg text-blue-500 mb-4 font-semibold">Vehicle Movement Heatmap</h3>
                  <MiniHeatMapWindow points={heatPoints} />
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    );
  }
  
export default HomePage;
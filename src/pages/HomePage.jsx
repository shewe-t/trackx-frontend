import { useState, useEffect } from "react";
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
import BarChartComponent from "../components/BarChartComponent";
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
    const [statusStats, setStatusStats] = useState({ resolved: 0, unresolved: 0 });
    const { profile } = useAuth();
    const navigate = useNavigate(); 
    const [monthlyCaseCounts, setMonthlyCaseCounts] = useState([]);
    const [regionCounts, setRegionCounts] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [globePoints, setGlobePoints] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const BLUE = "#1E40AF"; 
    const RED = "#B91C1C";  
    const COLORS = [BLUE, RED];

    // For Sign Out functionality
    const handleSignOut = async () => {
      try {
        await signOut(auth);
        navigate("/");
      } catch (error) {
        console.error("Sign-out failed:", error.message);
      }
    };

    // Check who the logged in user is
    useEffect(() => { 
      const user = auth.currentUser;
      if (user) {
        console.log("Logged in user:", user);
      } else {
        console.warn("No user is currently logged in.");
      }
    }, []);

    // OPTIMIZED: Combined all API calls into one useEffect
    useEffect(() => {
      const fetchAllHomePageData = async () => {
        setIsLoading(true);
        console.log("📡 Fetching all homepage data...");
        
        try {
          // Make all API calls simultaneously instead of sequentially
          const [
            recentCasesResponse,
            allCasesResponse, 
            monthlyCountsResponse,
            regionCountsResponse,
            heatPointsResponse,
            globePointsResponse
          ] = await Promise.all([
            axios.get(`${import.meta.env.VITE_API_URL}/cases/recent`),
            axios.get(`${import.meta.env.VITE_API_URL}/cases/search`, { params: {} }),
            axios.get(`${import.meta.env.VITE_API_URL}/cases/monthly-counts`),
            axios.get(`${import.meta.env.VITE_API_URL}/cases/region-counts`),
            axios.get(`${import.meta.env.VITE_API_URL}/cases/all-points`),
            axios.get(`${import.meta.env.VITE_API_URL}/cases/last-points`).catch(() => ({ data: { points: [] } })) // Handle 404 gracefully
          ]);

          // Process all responses - EXACTLY the same logic as before
          console.log("🆕 Recent cases response:", recentCasesResponse.data.cases);
          setRecentCases(recentCasesResponse.data.cases);

          // Process case statuses exactly as before
          const allCases = allCasesResponse.data.cases || [];
          const resolved = allCases.filter((c) => c.status === "resolved").length;
          const unresolved = allCases.filter((c) => c.status === "unresolved").length;
          setStatusStats({ resolved, unresolved });

          console.log("✅ Received monthly counts:", monthlyCountsResponse.data.counts);
          setMonthlyCaseCounts(monthlyCountsResponse.data.counts);

          console.log("🗺 Region count data:", regionCountsResponse.data.counts);
          setRegionCounts(regionCountsResponse.data.counts || []);

          const heatPointsData = heatPointsResponse.data.points || [];
          console.log("🔥 Raw heatmap points from backend:", heatPointsData);
          setHeatPoints(heatPointsData);

          const globePointsData = globePointsResponse.data.points || [];
          console.log("🟢 Retrieved globePoints:", globePointsData);
          setGlobePoints(globePointsData);

        } catch (error) {
          console.error("❌ Failed to fetch homepage data:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchAllHomePageData();
    }, []);

    const pieData = [
      { name: "Resolved", value: statusStats.resolved },
      { name: "Unresolved", value: statusStats.unresolved },
    ];

    // Show loading spinner while data loads (same visual style as your app)
    if (isLoading) {
      return (
        <div className="relative min-h-screen text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black" />
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Loading TrackX Dashboard...</p>
            </div>
          </div>
        </div>
        );
    }

    return (
      <div className="relative min-h-screen text-white overflow-hidden">
        <GlobeBackground clearMode={clearMode} globePoints={globePoints} />
        
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black opacity-40" />

        {/* Navigation */}
        <nav className="flex justify-between items-center bg-black bg-opacity-60 backdrop-blur-md p-4 relative z-50">
          <div className="flex items-center space-x-4">
            <div 
              className="text-white text-3xl cursor-pointer"
              onClick={() => setShowMenu(!showMenu)}
            >
              &#9776;
            </div>
            <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
          </div>

          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-3">
            <img src={trackxLogo} alt="TrackX Logo" className="h-8 w-auto" />
            <span className="text-3xl font-extrabold text-white">TrackX</span>
          </div>

          <div className="flex items-center space-x-6 text-white">
            <Link to="/home" className="hover:text-gray-300">Home</Link>
            <div className="flex flex-col text-right">
              <span className="text-white">
                {profile ? `${profile.firstName} ${profile.surname}` : "User"}
              </span>
              <button 
                onClick={handleSignOut}
                className="text-sm text-gray-300 hover:text-white"
              >
                Sign Out
              </button>
            </div>
            <div className="text-sm text-gray-300">
              {new Date().toLocaleString()}
            </div>
          </div>
        </nav>

        {/* Side Menu */}
        {showMenu && (
          <div className="fixed top-0 left-0 h-full w-64 bg-black bg-opacity-90 backdrop-blur-md z-40 p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Menu</h2>
              <button 
                onClick={() => setShowMenu(false)}
                className="text-white text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-white">
              <Link to="/home" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>Home</Link>
              <Link to="/new-case" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>New Case</Link>
              <Link to="/manage-cases" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>Manage Cases</Link>
              <Link to="/heatmap" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>Heatmap</Link>
              {profile?.role === "admin" && (
                <>
                  <Link to="/admin-dashboard" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>Admin Dashboard</Link>
                  <Link to="/pending-users" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>Pending Users</Link>
                  <Link to="/all-users" className="block hover:text-gray-300" onClick={() => setShowMenu(false)}>All Users</Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Content - EXACTLY the same layout as before */}
        <main className="relative z-10 p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-extrabold text-white drop-shadow-lg">
              Welcome to TrackX
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Advanced Digital Forensics Platform for Vehicle Investigation
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-6">
            <Link
              to="/new-case"
              className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              Create New Case
            </Link>
            <Link
              to="/manage-cases"
              className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              Manage Cases
            </Link>
          </div>

          {/* Dashboard Grid - EXACTLY the same layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            
            {/* Recent Cases */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Recent Cases</h2>
              <div className="space-y-3">
                {recentCases.slice(0, 3).map((caseItem, index) => (
                  <div key={index} className="flex justify-between items-center bg-black bg-opacity-20 rounded px-3 py-2">
                    <span className="text-white text-sm font-medium truncate">
                      {caseItem.caseTitle}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {new Date(caseItem.dateOfIncident).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
              <Link 
                to="/manage-cases" 
                className="inline-block mt-4 text-blue-400 hover:text-blue-300 text-sm"
              >
                View All Cases →
              </Link>
            </div>

            {/* Case Status Chart */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Case Status</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({name, value}) => `${name}: ${value}`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: '1px solid #374151',
                      borderRadius: '0.5rem'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Quick Stats */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Quick Stats</h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Cases:</span>
                  <span className="text-white font-bold">{statusStats.resolved + statusStats.unresolved}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Active Cases:</span>
                  <span className="text-white font-bold">{statusStats.unresolved}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Heat Points:</span>
                  <span className="text-white font-bold">{heatPoints.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Regions:</span>
                  <span className="text-white font-bold">{regionCounts.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
            
            {/* Monthly Case Trends */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Monthly Case Trends</h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyCaseCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9CA3AF"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    fontSize={12}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: '1px solid #374151',
                      borderRadius: '0.5rem'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Regional Case Distribution */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Cases by Region</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={regionCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="region" 
                    stroke="#9CA3AF"
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    fontSize={12}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: '1px solid #374151',
                      borderRadius: '0.5rem'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Heatmap Section - EXACTLY the same as before */}
          <div className="max-w-7xl mx-auto">
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Case Heatmap</h2>
              <MiniHeatMapWindow points={heatPoints} />
            </div>
          </div>

          {/* Controls - EXACTLY the same as before */}
          <div className="text-center space-y-4">
            <button
              onClick={() => setClearMode(!clearMode)}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-full transition-all duration-300"
            >
              {clearMode ? "Show Globe" : "Clear View"}
            </button>
          </div>
        </main>
      </div>
    );}
    export default HomePage;

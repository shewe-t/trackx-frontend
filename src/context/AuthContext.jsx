import { createContext, useEffect, useState, useContext, useCallback, useRef } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 🚀 PERFORMANCE FIX: Prevent duplicate profile fetches
  const profileFetchedRef = useRef(false);
  const currentUserIdRef = useRef(null);

  // 🚀 PERFORMANCE FIX: Memoized profile fetcher
  const fetchProfile = useCallback(async (currentUser) => {
    // Prevent duplicate fetches for the same user
    if (profileFetchedRef.current && currentUserIdRef.current === currentUser.uid) {
      console.log("AuthContext: Profile already fetched for this user, skipping...");
      return;
    }

    try {
      console.log("AuthContext: Fetching Firestore profile for UID:", currentUser.uid);
      const docRef = doc(db, "users", currentUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        console.log("AuthContext: Profile document found:", docSnap.data());
        setProfile(docSnap.data());
        profileFetchedRef.current = true;
        currentUserIdRef.current = currentUser.uid;
      } else {
        console.warn("AuthContext: Profile not found in Firestore.");
        setProfile(null);
      }
    } catch (error) {
      console.error("AuthContext: Error fetching profile:", error);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    console.log("AuthContext: Initializing onAuthStateChanged...");

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext: Auth state changed. currentUser:", currentUser ? "Present" : "None");

      if (currentUser) {
        try {
          // 🚀 PERFORMANCE FIX: Only refresh token if needed
          if (!currentUser.emailVerified) {
            console.log("AuthContext: Email not verified, forcing token refresh...");
            await currentUser.getIdToken(true);
            
            console.log("AuthContext: Reloading user to get fresh emailVerified...");
            await currentUser.reload();
            console.log("AuthContext: Reload complete. Email verified:", currentUser.emailVerified);
          }

          setUser(currentUser);
          
          // 🚀 PERFORMANCE FIX: Only fetch profile if user changed
          if (currentUserIdRef.current !== currentUser.uid) {
            profileFetchedRef.current = false; // Reset flag for new user
            await fetchProfile(currentUser);
          }
        } catch (error) {
          console.error("AuthContext: Error during user setup:", error);
          setUser(null);
          setProfile(null);
          // Reset refs on error
          profileFetchedRef.current = false;
          currentUserIdRef.current = null;
        }
      } else {
        console.log("AuthContext: No user is logged in.");
        setUser(null);
        setProfile(null);
        // Reset refs when user logs out
        profileFetchedRef.current = false;
        currentUserIdRef.current = null;
      }

      console.log("AuthContext: Finished processing auth state.");
      setLoading(false);
    });

    return () => {
      console.log("AuthContext: Cleaning up listener.");
      unsubscribe();
    };
  }, [fetchProfile]);

  // 🚀 PERFORMANCE FIX: Memoize context value to prevent unnecessary re-renders
  const contextValue = {
    user,
    profile,
    loading
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
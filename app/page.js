"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../utils/supabase";
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

export default function FanHome() {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activePage, setActivePage] = useState("home"); // home, search, chat, notifications
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Generate avatar based on user ID
  const generateAvatar = (userId) => {
    const avatar = createAvatar(avataaars, {
      seed: userId,
      size: 128,
    });
    return avatar.toDataUri();
  };

  // Get user avatar from localStorage or generate new one
  const getUserAvatar = (userId) => {
    const storedProfile = localStorage.getItem(`profile_${userId}`);
    if (storedProfile) {
      const profile = JSON.parse(storedProfile);
      return profile.avatar_url;
    }
    return generateAvatar(userId);
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      fetchRooms(); // Fetch rooms regardless of login status
      setLoading(false);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    };

    getSession();
  }, []);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rooms:', error);
    } else {
      setRooms(data);
    }
  };

  const handleAuthAction = async () => {
    setLoading(true);
    let error;
    if (isSignUp) {
      // Sign Up
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'user',
          }
        }
      });
      error = signUpError;
    } else {
      // Sign In
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    }

    if (error) {
      alert(error.message);
    }
    setLoading(false);
    };

  // Sidebar nav items for fan - now includes search, chat, notifications
  const navItems = [
    { key: "home", label: "Home", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><path d="M4 12L12 4l8 8"/><path d="M4 12v8a2 2 0 0 0 2 2h3m6 0h3a2 2 0 0 0 2-2v-8"/><path d="M9 21V12h6v9"/></svg>
    ) },
    { key: "search", label: "Search", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    ) },
    { key: "chat", label: "Chat", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ) },
    { key: "notifications", label: "Notifications", icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c7d5e0]"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="m13.73 21a2 2 0 0 1-3.46 0"/></svg>
    ) },
  ];

  // Render content based on active page
  const renderContent = () => {
    switch (activePage) {
      case "home":
        return (
          <>
            <div className="text-2xl mb-6 font-semibold text-white mt-0">Ultras</div>
            {rooms.length === 0 ? (
              <div className="text-[#8f98a0] text-center mt-20 font-semibold">No rooms created yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-[#2a475e] rounded-xl shadow-md overflow-hidden">
                    <div className="relative">
                      {room.cover_photo_url && typeof room.cover_photo_url === 'string' ? (
                        <img className="w-full h-48 object-cover" src={room.cover_photo_url} alt="Room cover" />
                      ) : (
                        <div className="w-full h-48 bg-[#171a21]"></div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex gap-4 items-center">
                        <div>
                          {room.profile_pic_url && typeof room.profile_pic_url === 'string' ? (
                            <img className="w-12 h-12 rounded-full object-cover" src={room.profile_pic_url} alt="Room profile" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#171a21] flex items-center justify-center">
                              <span className="text-white">?</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-white leading-tight">{room.title}</h3>
                          <p className="text-sm text-[#8f98a0]">{room.room_name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex justify-center">
                      <button
                        className="w-1/2 py-2 rounded-full bg-[#4f94bc] text-white text-base font-bold shadow hover:bg-[#66c0f4] transition-colors"
                        onClick={() => router.push(`/room/${room.id}`)}
                      >
                        Join Stream
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      case "search":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-24 h-24 bg-[#4f94bc] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Search</h1>
              <p className="text-xl text-[#8f98a0] mb-8">Find rooms, users, and content</p>
              <div className="bg-[#66c0f4] text-white px-6 py-3 rounded-lg text-lg font-semibold">
                🚀 Launching Soon
              </div>
            </div>
          </div>
        );
      case "chat":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-24 h-24 bg-[#4f94bc] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Chat</h1>
              <p className="text-xl text-[#8f98a0] mb-8">Connect with other fans</p>
              <div className="bg-[#66c0f4] text-white px-6 py-3 rounded-lg text-lg font-semibold">
                🚀 Launching Soon
              </div>
            </div>
          </div>
        );
      case "notifications":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-24 h-24 bg-[#4f94bc] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="m13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Notifications</h1>
              <p className="text-xl text-[#8f98a0] mb-8">Stay updated with your favorite streams</p>
              <div className="bg-[#66c0f4] text-white px-6 py-3 rounded-lg text-lg font-semibold">
                🚀 Launching Soon
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#1b2838] text-white">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1b2838] to-[#2a475e]">
        <div className="w-full max-w-sm p-8 space-y-6 bg-[#2a475e] rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-3xl font-bold text-center text-white">{isSignUp ? 'Fan Sign Up' : 'Fan Sign In'}</h2>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-600 bg-[#1b2838] text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
          />
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-600 bg-[#1b2838] text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
          />
          <button
            onClick={handleAuthAction}
            disabled={loading || !email || !password}
            className="w-full px-8 py-4 rounded-lg bg-[#66c0f4] text-white text-xl font-bold shadow-lg hover:bg-[#4f94bc] transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-center text-[#66c0f4] hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] font-[Inter,Arial Rounded MT,system-ui,sans-serif] text-[#c7d5e0]">
      {/* Sidebar */}
      <aside className="w-72 min-h-screen p-6 flex flex-col justify-between bg-[#2a475e] border-r border-gray-700 shadow-sm">
        <div>
          {/* Sidebar nav */}
          <nav className="flex flex-col gap-1 mb-8">
            {navItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg text-lg font-normal cursor-pointer hover:bg-[#1b2838] transition-colors select-none ${activePage === item.key ? 'bg-[#1b2838] font-semibold text-white' : 'text-[#c7d5e0]'}`}
                onClick={() => setActivePage(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </nav>
        </div>
        {/* User Profile */}
        <div
          onClick={() => router.push('/profile')}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1b2838] transition-colors cursor-pointer relative max-w-xs w-full"
        >
          {/* User Avatar */}
          <img
            src={getUserAvatar(user.id)}
            alt={user.user_metadata?.name || user.email || "User"}
            className="w-10 h-10 rounded-full border-2 border-[#2a475e] object-cover"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-white leading-tight truncate">{user.user_metadata?.name || user.email}</span>
            <span className="text-[#8f98a0] text-sm truncate">{user.email}</span>
          </div>
        </div>
      </aside>
      {/* Main Content */}
      <main className="flex-1 w-full pt-4 sm:pt-6 px-4 sm:px-8 lg:px-16 min-h-screen">
        {renderContent()}
      </main>
    </div>
  );
}
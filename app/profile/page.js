"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useRouter } from 'next/navigation';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [profile, setProfile] = useState({ username: "" });
    const router = useRouter();

    // Generate a random avatar based on user ID
    const generateAvatar = (userId) => {
        const avatar = createAvatar(avataaars, {
            seed: userId,
            size: 128,
        });
        return avatar.toDataUri();
    };

    // Generate a new random avatar
    const generateNewAvatar = () => {
        const randomSeed = Math.random().toString(36).substring(7);
        const avatar = createAvatar(avataaars, {
            seed: randomSeed,
            size: 128,
        });
        return avatar.toDataUri();
    };

    useEffect(() => {
        const getSessionAndProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setUser(session.user);
                // Try to fetch from profiles table
                const { data: dbProfile, error } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', session.user.id)
                    .single();
                let username = dbProfile?.username || "";
                let avatar_url = dbProfile?.avatar_url || generateAvatar(session.user.id);
                // If no username, try localStorage fallback
                if (!username) {
                    const storedProfile = localStorage.getItem(`profile_${session.user.id}`);
                    if (storedProfile) {
                        const parsed = JSON.parse(storedProfile);
                        username = parsed.username || "";
                        avatar_url = parsed.avatar_url || avatar_url;
                    }
                }
                setProfile({
                    id: session.user.id,
                    username,
                    avatar_url,
                    email: session.user.email,
                    updated_at: new Date().toISOString(),
                });
            }
            setLoading(false);
        };
        getSessionAndProfile();
    }, []);

    const handleLogout = async () => {
        // Get the current session to check the role before logging out
        const { data: { session } } = await supabase.auth.getSession();
        let redirectPath = '/';
        let role = session?.user?.user_metadata?.role;
        console.log('Logging out, user role:', role);
        if (role === 'host') {
            redirectPath = '/host';
        }
        await supabase.auth.signOut();
        // Use window.location to force a hard redirect (avoids Next.js router cache issues)
        window.location.href = redirectPath;
    };

    const updateProfile = async () => {
        try {
            setUpdating(true);
            if (!user) {
                alert("You must be logged in to update your profile.");
                setUpdating(false);
                return;
            }
            if (!profile.username || profile.username.trim().length < 3) {
                alert("Username is required and must be at least 3 characters.");
                setUpdating(false);
                return;
            }
            // Step 1: Update local profile data
            const updatedProfile = {
                id: user.id,
                username: profile.username,
                avatar_url: profile.avatar_url || generateAvatar(user.id),
                email: user.email,
                updated_at: new Date().toISOString(),
            };
            // Step 2: Save to localStorage
            localStorage.setItem(`profile_${user.id}`, JSON.stringify(updatedProfile));
            setProfile(updatedProfile);
            // Step 3: Upsert to Supabase profiles table
            const { error: upsertError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    username: updatedProfile.username,
                    avatar_url: updatedProfile.avatar_url,
                    updated_at: updatedProfile.updated_at,
                }, { onConflict: 'id' });
            if (upsertError) {
                alert('Error saving profile to database: ' + upsertError.message);
                setUpdating(false);
                return;
            }
            // Step 4: Try to update auth metadata (optional)
            try {
                await supabase.auth.updateUser({
                    data: {
                        avatar_url: updatedProfile.avatar_url,
                        username: updatedProfile.username,
                        updated_at: updatedProfile.updated_at
                    }
                });
            } catch (authError) {
                // ignore
            }
            alert('Profile updated successfully!');
        } catch (error) {
            console.error("Error updating profile:", error);
            alert(`Error updating profile: ${error.message}`);
        } finally {
            setUpdating(false);
        }
    };

    const handleNewAvatar = () => {
        const newAvatarUrl = generateNewAvatar();
        setProfile(prev => ({ ...prev, avatar_url: newAvatarUrl }));
    };

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-[#1b2838] text-white">Loading...</div>;
    }
    if (!user) {
        router.push('/');
        return null;
    }
    return (
        <div className="flex min-h-screen bg-gradient-to-b from-[#1b2838] to-[#2a475e] text-[#c7d5e0] justify-center items-center">
            <div className="w-full max-w-md p-8 space-y-6 bg-[#2a475e] rounded-xl shadow-lg border border-gray-700">
                <h2 className="text-3xl font-bold text-center text-white">User Profile</h2>
                <div className="flex flex-col items-center space-y-4">
                    <img
                        src={profile?.avatar_url || generateAvatar(user.id)}
                        alt="Avatar"
                        className="w-32 h-32 rounded-full object-cover border-4 border-[#66c0f4]"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleNewAvatar}
                            className="bg-[#66c0f4] text-white px-4 py-2 rounded-lg hover:bg-[#4f94bc] transition-colors"
                        >
                            🎲 New Avatar
                        </button>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-white">Email</label>
                        <input id="email" type="text" value={user.email} disabled className="w-full mt-1 px-4 py-2 rounded-lg border border-gray-600 bg-[#1b2838] text-gray-400" />
                    </div>
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-white">Username</label>
                        <input id="username" type="text" value={profile?.username || ''} onChange={(e) => setProfile({...profile, username: e.target.value})} className="w-full mt-1 px-4 py-2 rounded-lg border border-gray-600 bg-[#1b2838] text-white" required minLength={3} />
                    </div>
                </div>
                 <button
                    onClick={updateProfile}
                    className="w-full px-8 py-4 rounded-lg bg-[#66c0f4] text-white text-xl font-bold shadow-lg hover:bg-[#4f94bc] transition-colors"
                    disabled={updating}
                >
                    {updating ? 'Saving...' : 'Save Profile'}
                </button>
                <button
                    onClick={handleLogout}
                    className="w-full px-8 py-4 rounded-lg bg-[#c9302c] text-white text-xl font-bold shadow-lg hover:bg-[#a9201c] transition-colors"
                >
                    Logout
                </button>
            </div>
        </div>
    );
} 
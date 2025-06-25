-- Audio Streaming System Database Schema
-- This file documents the database tables and structure for the Banter audio streaming app
-- Use this file to set up the database schema for the audio streaming system

-- 1. Rooms Table (already exists)
-- Stores room information including host details
CREATE TABLE IF NOT EXISTS rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    room_name TEXT NOT NULL,
    host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    host_name TEXT,
    cover_photo_url TEXT,
    profile_pic_url TEXT,
    stage_background_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Room Participants Table (already exists)
-- Tracks all users in a room with their roles (audience, stage, host)
CREATE TABLE IF NOT EXISTS room_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_in_room TEXT NOT NULL CHECK (role_in_room IN ('audience', 'stage', 'host')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- 3. Room Messages Table (already exists)
-- Stores chat messages in rooms
CREATE TABLE IF NOT EXISTS room_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Profiles Table (already exists)
-- Stores user profile information
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables (if not already enabled)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Row Level Security (RLS) Policies
-- Note: These policies may already exist. If you get errors, you can skip this section.

-- Rooms policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Rooms are viewable by everyone') THEN
        CREATE POLICY "Rooms are viewable by everyone" ON rooms
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Users can create rooms') THEN
        CREATE POLICY "Users can create rooms" ON rooms
            FOR INSERT WITH CHECK (auth.uid() = host_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Hosts can update their own rooms') THEN
        CREATE POLICY "Hosts can update their own rooms" ON rooms
            FOR UPDATE USING (auth.uid() = host_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'Hosts can delete their own rooms') THEN
        CREATE POLICY "Hosts can delete their own rooms" ON rooms
            FOR DELETE USING (auth.uid() = host_id);
    END IF;
END $$;

-- Room participants policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Room participants are viewable by everyone') THEN
        CREATE POLICY "Room participants are viewable by everyone" ON room_participants
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can join rooms') THEN
        CREATE POLICY "Users can join rooms" ON room_participants
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can leave rooms') THEN
        CREATE POLICY "Users can leave rooms" ON room_participants
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Room messages policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_messages' AND policyname = 'Room messages are viewable by everyone') THEN
        CREATE POLICY "Room messages are viewable by everyone" ON room_messages
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_messages' AND policyname = 'Users can send messages') THEN
        CREATE POLICY "Users can send messages" ON room_messages
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_messages' AND policyname = 'Users can delete their own messages') THEN
        CREATE POLICY "Users can delete their own messages" ON room_messages
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Profiles policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Profiles are viewable by everyone') THEN
        CREATE POLICY "Profiles are viewable by everyone" ON profiles
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile') THEN
        CREATE POLICY "Users can update their own profile" ON profiles
            FOR UPDATE USING (auth.uid() = id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile') THEN
        CREATE POLICY "Users can insert their own profile" ON profiles
            FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Indexes for better performance (only create if they don't exist)
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_role ON room_participants(role_in_room);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_created_at ON room_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);

-- Functions for common operations (only create if they don't exist)

-- Function to get all participants in a room
CREATE OR REPLACE FUNCTION get_room_participants(room_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    role_in_room TEXT,
    username TEXT,
    avatar_url TEXT,
    joined_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rp.user_id,
        rp.role_in_room,
        p.username,
        p.avatar_url,
        rp.joined_at
    FROM room_participants rp
    LEFT JOIN profiles p ON rp.user_id = p.id
    WHERE rp.room_id = room_uuid
    ORDER BY rp.joined_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get stage participants (host + guests)
CREATE OR REPLACE FUNCTION get_stage_participants(room_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    avatar_url TEXT,
    role_in_room TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rp.user_id,
        p.username,
        p.avatar_url,
        rp.role_in_room
    FROM room_participants rp
    LEFT JOIN profiles p ON rp.user_id = p.id
    WHERE rp.room_id = room_uuid 
    AND rp.role_in_room IN ('stage', 'host')
    ORDER BY 
        CASE WHEN rp.role_in_room = 'host' THEN 0 ELSE 1 END,
        rp.joined_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audience members
CREATE OR REPLACE FUNCTION get_audience_members(room_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rp.user_id,
        p.username,
        p.avatar_url
    FROM room_participants rp
    LEFT JOIN profiles p ON rp.user_id = p.id
    WHERE rp.room_id = room_uuid 
    AND rp.role_in_room = 'audience'
    ORDER BY rp.joined_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments explaining the audio streaming system
COMMENT ON TABLE rooms IS 'Stores room information for audio streaming sessions';
COMMENT ON TABLE room_participants IS 'Tracks all users in a room with their roles (audience, stage, host) for audio streaming';
COMMENT ON TABLE room_messages IS 'Stores chat messages in audio streaming rooms';
COMMENT ON TABLE profiles IS 'Stores user profile information including avatars';

COMMENT ON COLUMN room_participants.role_in_room IS 'Role of user in the room: audience (listening), stage (speaking), host (room owner)';
COMMENT ON COLUMN room_participants.joined_at IS 'Timestamp when user joined the room';

-- WebRTC Audio Streaming Features:
-- 1. Real-time signaling via Supabase channels
-- 2. Peer-to-peer audio connections between stage participants
-- 3. Audio level monitoring and visualization
-- 4. Mute/unmute controls for each participant
-- 5. Automatic connection management when users join/leave stage
-- 6. Echo cancellation, noise suppression, and auto gain control 
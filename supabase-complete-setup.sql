-- Complete Supabase Setup for Audio Room System
-- Run this entire script in your Supabase SQL Editor

-- 1. Create tables if they don't exist
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

CREATE TABLE IF NOT EXISTS room_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_in_room TEXT NOT NULL CHECK (role_in_room IN ('audience', 'stage', 'host')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_role ON room_participants(role_in_room);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_role ON room_participants(room_id, role_in_room);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_created_at ON room_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);

-- 4. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON rooms;
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can update their own rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can delete their own rooms" ON rooms;

DROP POLICY IF EXISTS "Room participants are viewable by everyone" ON room_participants;
DROP POLICY IF EXISTS "Users can join rooms" ON room_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON room_participants;

DROP POLICY IF EXISTS "Room messages are viewable by everyone" ON room_messages;
DROP POLICY IF EXISTS "Users can send messages" ON room_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON room_messages;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- 5. Create RLS policies for rooms
CREATE POLICY "Rooms are viewable by everyone" ON rooms
    FOR SELECT USING (true);

CREATE POLICY "Users can create rooms" ON rooms
    FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own rooms" ON rooms
    FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own rooms" ON rooms
    FOR DELETE USING (auth.uid() = host_id);

-- 6. Create RLS policies for room_participants
CREATE POLICY "Room participants are viewable by everyone" ON room_participants
    FOR SELECT USING (true);

CREATE POLICY "Users can join rooms" ON room_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON room_participants
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms" ON room_participants
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Create RLS policies for room_messages
CREATE POLICY "Room messages are viewable by everyone" ON room_messages
    FOR SELECT USING (true);

CREATE POLICY "Users can send messages" ON room_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages" ON room_messages
    FOR DELETE USING (auth.uid() = user_id);

-- 8. Create RLS policies for profiles
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 9. Enable real-time for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;

-- 10. Create functions for common operations
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

-- 11. Create trigger to update room activity
CREATE OR REPLACE FUNCTION update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rooms 
    SET updated_at = NOW() 
    WHERE id = COALESCE(NEW.room_id, OLD.room_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for room activity updates
DROP TRIGGER IF EXISTS trigger_update_room_activity_participants ON room_participants;
CREATE TRIGGER trigger_update_room_activity_participants
    AFTER INSERT OR UPDATE OR DELETE ON room_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_room_activity();

DROP TRIGGER IF EXISTS trigger_update_room_activity_messages ON room_messages;
CREATE TRIGGER trigger_update_room_activity_messages
    AFTER INSERT OR UPDATE OR DELETE ON room_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_room_activity();

-- 12. Create function to clean up stale participants
CREATE OR REPLACE FUNCTION cleanup_stale_participants()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM room_participants 
    WHERE joined_at < NOW() - INTERVAL '30 minutes';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Create function to get room status
CREATE OR REPLACE FUNCTION get_room_status(room_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    total_participants BIGINT,
    audience_count BIGINT,
    stage_count BIGINT,
    message_count BIGINT,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as room_id,
        COUNT(rp.id) as total_participants,
        COUNT(CASE WHEN rp.role_in_room = 'audience' THEN 1 END) as audience_count,
        COUNT(CASE WHEN rp.role_in_room = 'stage' THEN 1 END) as stage_count,
        COUNT(rm.id) as message_count,
        GREATEST(MAX(rp.joined_at), MAX(rm.created_at)) as last_activity
    FROM rooms r
    LEFT JOIN room_participants rp ON r.id = rp.room_id
    LEFT JOIN room_messages rm ON r.id = rm.room_id
    WHERE r.id = room_uuid
    GROUP BY r.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Add comments for documentation
COMMENT ON TABLE rooms IS 'Stores room information for audio streaming sessions';
COMMENT ON TABLE room_participants IS 'Tracks all users in a room with their roles (audience, stage, host) for audio streaming';
COMMENT ON TABLE room_messages IS 'Stores chat messages in audio streaming rooms';
COMMENT ON TABLE profiles IS 'Stores user profile information including avatars';

COMMENT ON COLUMN room_participants.role_in_room IS 'Role of user in the room: audience (listening), stage (speaking), host (room owner)';
COMMENT ON COLUMN room_participants.joined_at IS 'Timestamp when user joined the room';

-- 15. Verify the setup
SELECT 'Tables created successfully' as status;

-- Check if tables exist
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('rooms', 'room_participants', 'room_messages', 'profiles') 
        THEN '✅' 
        ELSE '❌' 
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('rooms', 'room_participants', 'room_messages', 'profiles');

-- Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('rooms', 'room_participants', 'room_messages', 'profiles');

-- Check real-time publication
SELECT 
    schemaname,
    tablename,
    pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('rooms', 'room_participants', 'room_messages')
ORDER BY tablename;

-- Check policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('rooms', 'room_participants', 'room_messages', 'profiles')
ORDER BY tablename, policyname; 
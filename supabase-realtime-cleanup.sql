-- Supabase Real-Time Cleanup & RLS Policy Fix
-- This script will:
-- 1. Remove duplicate/conflicting RLS policies
-- 2. Add only the necessary policies for real-time
-- 3. Ensure all tables are in the supabase_realtime publication

-- 1. Clean up RLS policies for rooms
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON rooms;
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can update their own rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can delete their own rooms" ON rooms;

CREATE POLICY "Rooms are viewable by everyone" ON rooms FOR SELECT USING (true);
CREATE POLICY "Users can create rooms" ON rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update their own rooms" ON rooms FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Hosts can delete their own rooms" ON rooms FOR DELETE USING (auth.uid() = host_id);

-- 2. Clean up RLS policies for room_participants
DROP POLICY IF EXISTS "Room participants are viewable by everyone" ON room_participants;
DROP POLICY IF EXISTS "Users can join rooms" ON room_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON room_participants;

CREATE POLICY "Room participants are viewable by everyone" ON room_participants FOR SELECT USING (true);
CREATE POLICY "Users can join rooms" ON room_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own participation" ON room_participants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON room_participants FOR DELETE USING (auth.uid() = user_id);

-- 3. Clean up RLS policies for room_messages
DROP POLICY IF EXISTS "Room messages are viewable by everyone" ON room_messages;
DROP POLICY IF EXISTS "Users can send messages" ON room_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON room_messages;

CREATE POLICY "Room messages are viewable by everyone" ON room_messages FOR SELECT USING (true);
CREATE POLICY "Users can send messages" ON room_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own messages" ON room_messages FOR DELETE USING (auth.uid() = user_id);

-- 4. Clean up RLS policies for profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 5. Ensure all tables are in the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- 6. Add recommended indexes for performance
CREATE INDEX IF NOT EXISTS idx_room_participants_room_role ON room_participants(room_id, role_in_room);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages(room_id, created_at);

-- 7. (Optional) Add real-time for profile changes
-- You can subscribe to the 'profiles' table in your frontend for live profile updates.

-- 8. Verify setup
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('rooms', 'room_participants', 'room_messages', 'profiles') ORDER BY tablename, policyname; 
-- Complete RLS Fix for room_participants table
-- This script fixes all the missing RLS policies that are preventing stage management

-- 1. First, let's see what policies currently exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'room_participants';

-- 2. Drop existing policies that might be conflicting
DROP POLICY IF EXISTS "Users can join rooms" ON room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON room_participants;
DROP POLICY IF EXISTS "Room participants are viewable by everyone" ON room_participants;

-- 3. Create comprehensive policies for room_participants

-- Policy for viewing room participants (everyone can see)
CREATE POLICY "Room participants are viewable by everyone" ON room_participants
    FOR SELECT USING (true);

-- Policy for users to join rooms (insert)
CREATE POLICY "Users can join rooms" ON room_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to leave rooms (delete their own participation)
CREATE POLICY "Users can leave rooms" ON room_participants
    FOR DELETE USING (auth.uid() = user_id);

-- Policy for users to update their own participation
CREATE POLICY "Users can update their own participation" ON room_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for hosts to manage stage participants (update)
CREATE POLICY "Hosts can manage stage participants" ON room_participants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.id = room_participants.room_id 
            AND rooms.host_id = auth.uid()
        )
    );

-- Policy for hosts to add users to stage (insert)
CREATE POLICY "Hosts can add users to stage" ON room_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.id = room_participants.room_id 
            AND rooms.host_id = auth.uid()
        )
    );

-- Policy for hosts to remove users from stage (delete)
CREATE POLICY "Hosts can remove users from stage" ON room_participants
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.id = room_participants.room_id 
            AND rooms.host_id = auth.uid()
        )
    );

-- 4. Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'room_participants'
ORDER BY policyname;

-- 5. Test the policies with a sample query
-- This will help verify that the policies are working correctly
SELECT 
    'RLS Test' as test_name,
    COUNT(*) as total_policies,
    COUNT(CASE WHEN cmd = 'SELECT' THEN 1 END) as select_policies,
    COUNT(CASE WHEN cmd = 'INSERT' THEN 1 END) as insert_policies,
    COUNT(CASE WHEN cmd = 'UPDATE' THEN 1 END) as update_policies,
    COUNT(CASE WHEN cmd = 'DELETE' THEN 1 END) as delete_policies
FROM pg_policies 
WHERE tablename = 'room_participants'; 
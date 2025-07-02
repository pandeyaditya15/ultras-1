-- Safe RLS Fix for room_participants table
-- This script safely adds missing RLS policies without conflicts

-- 1. First, let's see what policies currently exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'room_participants'
ORDER BY policyname;

-- 2. Create policies only if they don't exist (using DO blocks)

-- Policy for viewing room participants (everyone can see)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Room participants are viewable by everyone') THEN
        CREATE POLICY "Room participants are viewable by everyone" ON room_participants
            FOR SELECT USING (true);
        RAISE NOTICE 'Created policy: Room participants are viewable by everyone';
    ELSE
        RAISE NOTICE 'Policy already exists: Room participants are viewable by everyone';
    END IF;
END $$;

-- Policy for users to join rooms (insert)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can join rooms') THEN
        CREATE POLICY "Users can join rooms" ON room_participants
            FOR INSERT WITH CHECK (auth.uid() = user_id);
        RAISE NOTICE 'Created policy: Users can join rooms';
    ELSE
        RAISE NOTICE 'Policy already exists: Users can join rooms';
    END IF;
END $$;

-- Policy for users to leave rooms (delete their own participation)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can leave rooms') THEN
        CREATE POLICY "Users can leave rooms" ON room_participants
            FOR DELETE USING (auth.uid() = user_id);
        RAISE NOTICE 'Created policy: Users can leave rooms';
    ELSE
        RAISE NOTICE 'Policy already exists: Users can leave rooms';
    END IF;
END $$;

-- Policy for users to update their own participation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can update their own participation') THEN
        CREATE POLICY "Users can update their own participation" ON room_participants
            FOR UPDATE USING (auth.uid() = user_id);
        RAISE NOTICE 'Created policy: Users can update their own participation';
    ELSE
        RAISE NOTICE 'Policy already exists: Users can update their own participation';
    END IF;
END $$;

-- Policy for hosts to manage stage participants (update)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Hosts can manage stage participants') THEN
        CREATE POLICY "Hosts can manage stage participants" ON room_participants
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM rooms 
                    WHERE rooms.id = room_participants.room_id 
                    AND rooms.host_id = auth.uid()
                )
            );
        RAISE NOTICE 'Created policy: Hosts can manage stage participants';
    ELSE
        RAISE NOTICE 'Policy already exists: Hosts can manage stage participants';
    END IF;
END $$;

-- Policy for hosts to add users to stage (insert)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Hosts can add users to stage') THEN
        CREATE POLICY "Hosts can add users to stage" ON room_participants
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM rooms 
                    WHERE rooms.id = room_participants.room_id 
                    AND rooms.host_id = auth.uid()
                )
            );
        RAISE NOTICE 'Created policy: Hosts can add users to stage';
    ELSE
        RAISE NOTICE 'Policy already exists: Hosts can add users to stage';
    END IF;
END $$;

-- Policy for hosts to remove users from stage (delete)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Hosts can remove users from stage') THEN
        CREATE POLICY "Hosts can remove users from stage" ON room_participants
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM rooms 
                    WHERE rooms.id = room_participants.room_id 
                    AND rooms.host_id = auth.uid()
                )
            );
        RAISE NOTICE 'Created policy: Hosts can remove users from stage';
    ELSE
        RAISE NOTICE 'Policy already exists: Hosts can remove users from stage';
    END IF;
END $$;

-- 3. Verify the final policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'room_participants'
ORDER BY policyname;

-- 4. Summary of policies
SELECT 
    'RLS Summary' as test_name,
    COUNT(*) as total_policies,
    COUNT(CASE WHEN cmd = 'SELECT' THEN 1 END) as select_policies,
    COUNT(CASE WHEN cmd = 'INSERT' THEN 1 END) as insert_policies,
    COUNT(CASE WHEN cmd = 'UPDATE' THEN 1 END) as update_policies,
    COUNT(CASE WHEN cmd = 'DELETE' THEN 1 END) as delete_policies
FROM pg_policies 
WHERE tablename = 'room_participants'; 
-- Fix for room_participants UPDATE policy
-- This adds the missing RLS policy that allows users to update their own room_participants records

-- Add UPDATE policy for room_participants
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'Users can update their own room participation') THEN
        CREATE POLICY "Users can update their own room participation" ON room_participants
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Also add a policy for hosts to manage stage participants
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
    END IF;
END $$;

-- Add INSERT policy for hosts to add users to stage
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
    END IF;
END $$; 
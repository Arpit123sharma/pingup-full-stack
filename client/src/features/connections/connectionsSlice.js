import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axios'


const initialState = {
    connections: [],
    pendingConnections: [],
    followers: [],
    following: []
}

export const fetchConnections = createAsyncThunk('connections/fetchConnections', async (token) => {
    const { data } = await api.get('/api/user/connections', {
         headers: { Authorization: `Bearer ${token}` },
    })
    return data.success ? data : null;
})

const connectionsSlice = createSlice({
    name: 'connections',
    initialState,
    reducers: {

    },
    extraReducers: (builder)=>{
        builder
        .addCase(fetchConnections.pending, (state) => {
            state.loading = true;
        })
        .addCase(fetchConnections.fulfilled, (state, action)=>{
            state.loading = false;
            console.log('fetchConnections fulfilled:', action.payload);
            if(action.payload && action.payload.success){
                state.connections = action.payload.connections || [];
                state.pendingConnections = action.payload.pendingConnections || [];
                state.followers = action.payload.followers || [];
                state.following = action.payload.following || [];
            }
        })
        .addCase(fetchConnections.rejected, (state, action)=>{
            state.loading = false;
            state.error = action.error.message;
        })
    }
})

export default connectionsSlice.reducer
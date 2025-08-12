import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  Avatar,
  Box,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Menu,
  MenuItem
} from '@mui/material';
import { ArrowBack, Group, CalendarToday, Edit, MoreVert, Delete } from '@mui/icons-material';
import { groupService } from '../../services/groupService';
import LoadingSpinner from '../../components/LoadingSpinner';
import { USER_ROLES } from '../../constants';

const GroupInfo = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [memberMenuAnchor, setMemberMenuAnchor] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    const fetchGroupDetails = async () => {
      try {
        const data = await groupService.getGroupDetails(groupId);
        setGroupData(data);
        setEditName(data.name || '');
        setEditDescription(data.description || '');
      } catch (err) {
        setError('Failed to load group details');
      } finally {
        setLoading(false);
      }
    };

    if (groupId) {
      fetchGroupDetails();
    }
  }, [groupId]);

  const handleEditGroup = async () => {
    try {
      await groupService.updateGroup(groupId, {
        name: editName,
        description: editDescription
      });
      setGroupData({ ...groupData, name: editName, description: editDescription });
      setEditDialogOpen(false);
    } catch (err) {
      setError('Failed to update group');
    }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await groupService.removeGroupMembers(groupId, [memberId]);
      setGroupData({
        ...groupData,
        members: groupData.members.filter(m => m.userId._id !== memberId)
      });
      setMemberMenuAnchor(null);
      setSelectedMember(null);
    } catch (err) {
      setError('Failed to remove member');
    }
  };

  const handleMemberMenuOpen = (event, member) => {
    setMemberMenuAnchor(event.currentTarget);
    setSelectedMember(member);
  };

  const handleMemberMenuClose = () => {
    setMemberMenuAnchor(null);
    setSelectedMember(null);
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!groupData) return <Typography>Group not found</Typography>;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4">Group Information</Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Avatar
              src={groupData.groupPicture}
              sx={{ width: 80, height: 80, mr: 3 }}
            >
              <Group />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" gutterBottom>
                {groupData.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CalendarToday sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Created: {formatDate(groupData.createdAt)}
                </Typography>
              </Box>
              <Chip
                label={`${groupData.members?.length || 0} members`}
                color="primary"
                size="small"
              />
            </Box>
            <Button 
              onClick={() => setEditDialogOpen(true)}
              variant="contained"
              color="primary"
              sx={{ mr: 1 }}
            >
              Edit Group
            </Button>
          </Box>

          {groupData.description && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Description
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {groupData.description}
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>
            Members ({groupData.members?.length || 0})
          </Typography>
          <List>
            {groupData.members?.map((member) => (
              <ListItem key={member._id}>
                <ListItemAvatar>
                  <Avatar src={member.profilePicture}>
                    {member.userId?.name?.charAt(0) || member.name?.charAt(0)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={member.userId?.name || member.name}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={member.role}
                        size="small"
                        color={member.role === USER_ROLES.ADMIN ? 'secondary' : 'default'}
                      />
                      {(member.userId?.email || member.email) && (
                        <Typography variant="caption" color="text.secondary">
                          {member.userId?.email || member.email}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <Button 
                  onClick={() => handleRemoveMember(selectedMember?.userId?._id || member.userId?._id || member._id)}
                  size="small"
                  variant="contained"
                  color="error"
                  sx={{ ml: 1 }}
                >
                  Remove
                </Button>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Group Details</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            margin="normal"
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEditGroup} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={memberMenuAnchor}
        open={Boolean(memberMenuAnchor)}
        onClose={handleMemberMenuClose}
      >
        <MenuItem onClick={() => handleRemoveMember(selectedMember?.userId?._id || selectedMember?._id)}>
          <Delete sx={{ mr: 1 }} />
          Remove Member
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default GroupInfo;
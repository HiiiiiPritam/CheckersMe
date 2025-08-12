import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, typography, spacing } from '../theme';
import { groupService } from '../services/groupService';
import { AddMembersModal } from '../components/common/AddMembersModal';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

interface GroupMember {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  };
  role: string;
  joinedAt: string;
}

interface GroupDetails {
  _id: string;
  name: string;
  description?: string;
  groupPicture?: string;
  creator: {
    _id: string;
    name: string;
  };
  createdAt: string;
  members: GroupMember[];
}

interface GroupDetailsScreenProps {
  route: {
    params: {
      groupId: string;
    };
  };
  navigation: any;
}

export const GroupDetailsScreen: React.FC<GroupDetailsScreenProps> = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useSelector((state: RootState) => state.auth);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  
  const isChecker = user?.role === 'checker';
  const [loading, setLoading] = useState(true);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupDetails();
  }, []);

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      const details = await groupService.getGroupDetails(groupId);
      setGroupDetails(details);
      setEditName(details.name);
      setEditDescription(details.description || '');
    } catch (error) {
      Alert.alert('Error', 'Failed to load group details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = async () => {
    try {
      await groupService.updateGroup(groupId, {
        name: editName,
        description: editDescription
      });
      setGroupDetails(prev => prev ? {
        ...prev,
        name: editName,
        description: editDescription
      } : null);
      setShowEditModal(false);
      Alert.alert('Success', 'Group updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update group');
    }
  };

  const handleRemoveMember = (memberId: string) => {
    setMemberToDelete(memberId);
    setShowDeleteModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return;
    try {
      const result = await groupService.removeGroupMembers(groupId, [memberToDelete]);
      setGroupDetails(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.userId._id !== memberToDelete)
      } : null);
      setShowDeleteModal(false);
      setMemberToDelete(null);
    } catch (error) {
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading group details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groupDetails) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Group Info Section */}
        <View style={styles.groupInfoSection}>
          <View style={styles.groupAvatar}>
            {groupDetails.groupPicture ? (
              <Image
                source={{ uri: groupDetails.groupPicture }}
                style={styles.groupImage}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.groupAvatarText}>
                {groupDetails.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.groupNameContainer}>
            <Text style={styles.groupName}>{groupDetails.name}</Text>
            {isChecker && (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => setShowEditModal(true)}
              >
                <Ionicons name="pencil" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          {groupDetails.description && (
            <Text style={styles.groupDescription} numberOfLines={3}>{groupDetails.description}</Text>
          )}
        </View>

        {/* Group Details Section */}
        <View style={styles.detailsSection}>
          <View style={styles.detailItem}>
            <Ionicons name="person" size={20} color={colors.primary} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Created by</Text>
              <Text style={styles.detailValue}>{groupDetails.admin.name}</Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Created on</Text>
              <Text style={styles.detailValue}>{formatDate(groupDetails.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="people" size={20} color={colors.primary} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Members</Text>
              <Text style={styles.detailValue}>{groupDetails.members.length} members</Text>
            </View>
          </View>
        </View>

        {/* Members Section */}
        <View style={styles.membersSection}>
          <View style={styles.membersSectionHeader}>
            <Text style={styles.sectionTitle}>Members</Text>
            {isChecker && (
              <TouchableOpacity 
                style={styles.addMembersButton}
                onPress={() => setShowAddMembersModal(true)}
              >
                <Ionicons name="person-add" size={20} color={colors.primary} />
                <Text style={styles.addMembersText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {groupDetails.members.map((member) => (
            <View key={member._id} style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {member.userId.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.userId.name}</Text>
              </View>
              <View style={styles.memberActions}>
                <View style={styles.memberRole}>
                  <Text style={[styles.roleText, member.role === 'admin' && styles.adminRole]}>
                    {member.role}
                  </Text>
                </View>
                {isChecker && (
                  <TouchableOpacity 
                    style={styles.removeButton}
                    onPress={() => {
                      handleRemoveMember(member.userId._id);
                    }}
                  >
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      
      <AddMembersModal
        visible={showAddMembersModal}
        onClose={() => setShowAddMembersModal(false)}
        groupId={groupId}
        existingMemberIds={groupDetails?.members.map(m => m.userId._id) || []}
        onMembersAdded={fetchGroupDetails}
      />
      
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Group</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="Group name"
              value={editName}
              onChangeText={setEditName}
              maxLength={100}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optional)"
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={handleEditGroup}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <Text style={styles.deleteTitle}>Remove Member</Text>
            <Text style={styles.deleteMessage}>Are you sure you want to remove this member from the group?</Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => {
                  setShowDeleteModal(false);
                  setMemberToDelete(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.deleteButton} 
                onPress={confirmRemoveMember}
              >
                <Text style={styles.deleteText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  groupInfoSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  groupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  groupImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  groupAvatarText: {
    fontSize: 36,
    fontWeight: typography.fontWeight.bold,
    color: colors.surface,
  },
  groupName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  groupDescription: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  detailsSection: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailContent: {
    marginLeft: spacing.md,
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: typography.fontSize.base,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  membersSection: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
  },
  membersSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  addMembersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
  },
  addMembersText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.surface,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  memberRole: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  roleText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  adminRole: {
    color: colors.primary,
  },
  groupNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  editButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
    borderRadius: 12,
    backgroundColor: '#ffebee',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModal: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginBottom: spacing.md,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  saveText: {
    fontSize: typography.fontSize.base,
    color: colors.surface,
    fontWeight: typography.fontWeight.medium,
  },
  deleteModal: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 350,
  },
  deleteTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  deleteMessage: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  deleteButton: {
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  deleteText: {
    fontSize: typography.fontSize.base,
    color: colors.surface,
    fontWeight: typography.fontWeight.medium,
  },
});
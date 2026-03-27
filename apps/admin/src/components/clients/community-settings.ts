export interface CommunityWriteSettings {
  announcementsWriteLevel?: 'all_members' | 'admin_only';
  meetingsWriteLevel?: 'all_members' | 'admin_only';
  meetingDocumentsWriteLevel?: 'all_members' | 'admin_only';
  unitsWriteLevel?: 'all_members' | 'admin_only';
  leasesWriteLevel?: 'all_members' | 'admin_only';
  documentCategoriesWriteLevel?: 'all_members' | 'admin_only';
}

export interface CommunitySettings extends CommunityWriteSettings {
  electionsAttorneyReviewed?: boolean;
}

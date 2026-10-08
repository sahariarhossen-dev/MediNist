export type LocationType = 'branch' | 'warehouse';

export type UserRole = 'owner' | 'manager' | 'salesman';

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  code?: string;
  phone?: string;
  email?: string;
  proprietor_name?: string;
  drug_license?: string;
  trade_license?: string;
  invoice_footer?: string;
  default_discount?: number;
  logo_url?: string;
  cover_url?: string;
  is_active?: boolean;
  is_main?: boolean;
}

export type NewLocationInput = Omit<Location, 'id'>;

export type TransferStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface StockTransfer {
  id: string;
  date: string;
  from_location_id: string;
  from_location_name: string;
  to_location_id: string;
  to_location_name: string;
  medicine_id?: string;
  medicine_name: string;
  generic_name?: string;
  dosage?: string;
  quantity: number;
  unit: string;
  status: TransferStatus;
  note?: string;
  reference_number?: string;
  created_at: string;
  created_by?: string;
}

export interface NewStockTransferInput {
  from_location_id: string;
  from_location_name: string;
  to_location_id: string;
  to_location_name: string;
  medicine_id?: string;
  medicine_name: string;
  generic_name?: string;
  dosage?: string;
  quantity: number;
  unit: string;
  note?: string;
  reference_number?: string;
  created_at?: string;
}

export interface LocationContextType {
  locations: Location[];
  activeLocation: Location;
  setActiveLocation: (id: string) => void;
  addLocation: (data: NewLocationInput) => Promise<Location | null> | Location | null;
  updateLocation: (id: string, data: Partial<NewLocationInput>) => Promise<boolean>;
  deleteLocation: (id: string) => Promise<boolean>;
  toggleLocationStatus: (id: string) => Promise<boolean> | void;
  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;
  isMultiLocation: boolean;
  transfers: StockTransfer[];
  initiateTransfer: (data: NewStockTransferInput) => Promise<StockTransfer> | StockTransfer;
  acceptTransfer: (id: string) => Promise<void> | void;
  rejectTransfer: (id: string) => Promise<void> | void;
  updateTransferStatus: (id: string, status: TransferStatus) => void;
  isLoadingLocations?: boolean;
  refetchLocations?: () => Promise<void>;
  isWarehouse?: boolean;
}


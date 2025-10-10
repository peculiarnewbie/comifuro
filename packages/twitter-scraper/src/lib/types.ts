export interface ImportRecord {
    dateFolder: string;
    importedAt: string;
    imagesUploadedAt?: string; // Optional for backward compatibility
}

export interface TweetData {
    user: string;
    time: string;
    text: string;
    id: string;
}

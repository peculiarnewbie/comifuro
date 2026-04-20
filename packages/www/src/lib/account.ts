const ACCOUNT_ID_KEY = "comifuro-account-id";

export function getOrCreateAccountId(): string {
    let id = localStorage.getItem(ACCOUNT_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(ACCOUNT_ID_KEY, id);
    }
    return id;
}

export function resetAccountId(): string {
    localStorage.removeItem(ACCOUNT_ID_KEY);
    return getOrCreateAccountId();
}

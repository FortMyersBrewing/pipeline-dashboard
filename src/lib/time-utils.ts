export function formatTimestamp(date: string | Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 0-indexed, so add 1
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    
    return `${year}.${month}.${day} ${hours}:${minutes}`;
}
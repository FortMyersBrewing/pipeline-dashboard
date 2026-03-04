export function formatTimestamp(date: string | Date | null | undefined): string {
    if (!date) return '—';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    
    return `${year}.${month}.${day} ${hours}:${minutes}`;
}
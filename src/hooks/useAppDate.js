import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const useAppDate = () => {
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => base44.entities.Settings.get(),
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    const timezone = settings?.timezone || 'Indian/Antananarivo';

    const formatDate = (date, formatStr = 'dd/MM/yyyy HH:mm') => {
        if (!date) return '';

        // Handle SQLite default TIMESTAMP format (YYYY-MM-DD HH:MM:SS) which is UTC
        // but parsed as local by default in some browsers if "Z" is missing.
        let dateToParse = date;
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date)) {
            dateToParse = date.replace(' ', 'T') + 'Z';
        }

        const d = new Date(dateToParse);

        // If timezone is set, shift the date
        if (timezone) {
            try {
                // Get the date string in the target timezone
                const targetTimeStr = d.toLocaleString('en-US', { timeZone: timezone });
                // Parse it back as a local date (preserves the face value numbers)
                const shiftedDate = new Date(targetTimeStr);
                return format(shiftedDate, formatStr, { locale: fr });
            } catch (e) {
                console.warn('Invalid timezone:', timezone);
                return format(d, formatStr, { locale: fr });
            }
        }

        return format(d, formatStr, { locale: fr });
    };

    return { formatDate, timezone };
};

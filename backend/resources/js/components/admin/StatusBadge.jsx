import { Badge } from '@/components/ui/badge';

const statusConfig = {
    pending: { variant: 'outline', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    processing: { variant: 'outline', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    printed: { variant: 'outline', className: 'bg-green-50 text-green-700 border-green-200' },
    failed: { variant: 'destructive', className: '' },
    canceled: { variant: 'secondary', className: '' },
};

export default function StatusBadge({ status }) {
    const config = statusConfig[status] || statusConfig.pending;

    return (
        <Badge variant={config.variant} className={config.className}>
            {status}
        </Badge>
    );
}

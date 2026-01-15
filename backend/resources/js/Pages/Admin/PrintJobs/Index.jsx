import { useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { Link, router } from '@inertiajs/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import StatusBadge from '@/components/admin/StatusBadge';
import {
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    RefreshCw,
    XCircle,
    Filter,
    X,
} from 'lucide-react';

export default function PrintJobsIndex({ jobs, filters, devices, statuses }) {
    const { data, current_page, last_page } = jobs;

    const [localFilters, setLocalFilters] = useState({
        status: filters.status || 'all',
        device_id: filters.device_id || 'all',
        date_from: filters.date_from || '',
        date_to: filters.date_to || '',
    });

    const applyFilters = () => {
        const params = {};
        if (localFilters.status && localFilters.status !== 'all') params.status = localFilters.status;
        if (localFilters.device_id && localFilters.device_id !== 'all') params.device_id = localFilters.device_id;
        if (localFilters.date_from) params.date_from = localFilters.date_from;
        if (localFilters.date_to) params.date_to = localFilters.date_to;

        router.get('/admin/print-jobs', params);
    };

    const clearFilters = () => {
        setLocalFilters({ status: 'all', device_id: 'all', date_from: '', date_to: '' });
        router.get('/admin/print-jobs');
    };

    const hasActiveFilters = filters.status || filters.device_id || filters.date_from || filters.date_to;

    const handleReprint = (jobId) => {
        router.post(`/admin/print-jobs/${jobId}/reprint`);
    };

    const handleCancel = (jobId) => {
        router.post(`/admin/print-jobs/${jobId}/cancel`);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Print Jobs</h1>
                <p className="text-muted-foreground">View and manage print job history</p>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Filter className="w-4 h-4" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4">
                        <Select
                            value={localFilters.status}
                            onValueChange={(value) =>
                                setLocalFilters({ ...localFilters, status: value })
                            }
                        >
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                {statuses.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={localFilters.device_id}
                            onValueChange={(value) =>
                                setLocalFilters({ ...localFilters, device_id: value })
                            }
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Device" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All devices</SelectItem>
                                {devices.map((device) => (
                                    <SelectItem key={device.id} value={device.id.toString()}>
                                        {device.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                            <Input
                                type="date"
                                value={localFilters.date_from}
                                onChange={(e) =>
                                    setLocalFilters({ ...localFilters, date_from: e.target.value })
                                }
                                className="w-[150px]"
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                                type="date"
                                value={localFilters.date_to}
                                onChange={(e) =>
                                    setLocalFilters({ ...localFilters, date_to: e.target.value })
                                }
                                className="w-[150px]"
                            />
                        </div>

                        <Button onClick={applyFilters}>Apply</Button>

                        {hasActiveFilters && (
                            <Button variant="ghost" onClick={clearFilters}>
                                <X className="w-4 h-4 mr-2" />
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">Photo</TableHead>
                                <TableHead>Device</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Printed</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-center text-muted-foreground py-8"
                                    >
                                        No print jobs found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.map((job) => (
                                    <TableRow key={job.id}>
                                        <TableCell>
                                            {job.photo_url ? (
                                                <Link href={`/admin/photos/${job.photo_id}`}>
                                                    <img
                                                        src={job.photo_url}
                                                        alt=""
                                                        className="w-12 h-12 object-cover rounded"
                                                    />
                                                </Link>
                                            ) : (
                                                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                                                    N/A
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {job.device_name}
                                        </TableCell>
                                        <TableCell className="capitalize">{job.type}</TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <StatusBadge status={job.status} />
                                                {job.error_message && (
                                                    <p className="text-xs text-destructive max-w-[200px] truncate">
                                                        {job.error_message}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(job.created_at).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {job.printed_at
                                                ? new Date(job.printed_at).toLocaleString()
                                                : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => handleReprint(job.id)}
                                                    >
                                                        <RefreshCw className="w-4 h-4 mr-2" />
                                                        Reprint
                                                    </DropdownMenuItem>
                                                    {job.status === 'pending' && (
                                                        <DropdownMenuItem
                                                            onClick={() => handleCancel(job.id)}
                                                            className="text-destructive"
                                                        >
                                                            <XCircle className="w-4 h-4 mr-2" />
                                                            Cancel
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {last_page > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={current_page === 1}
                        onClick={() =>
                            router.get('/admin/print-jobs', {
                                ...filters,
                                page: current_page - 1,
                            })
                        }
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                        Page {current_page} of {last_page}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={current_page === last_page}
                        onClick={() =>
                            router.get('/admin/print-jobs', {
                                ...filters,
                                page: current_page + 1,
                            })
                        }
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}

PrintJobsIndex.layout = (page) => <AdminLayout>{page}</AdminLayout>;

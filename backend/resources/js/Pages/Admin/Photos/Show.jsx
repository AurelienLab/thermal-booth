import { useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { Link, router } from '@inertiajs/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import DitherPreview from '@/components/admin/DitherPreview';
import StatusBadge from '@/components/admin/StatusBadge';
import { ArrowLeft, Printer, Trash2 } from 'lucide-react';

export default function PhotoShow({ photo, devices }) {
    const [selectedDevice, setSelectedDevice] = useState(devices[0]?.id?.toString() || '');
    const [contrast, setContrast] = useState(30);
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = () => {
        setIsPrinting(true);
        router.post(
            `/admin/photos/${photo.id}/print`,
            {
                device_id: selectedDevice,
                contrast: contrast,
            },
            {
                onFinish: () => setIsPrinting(false),
            }
        );
    };

    const handleDelete = () => {
        router.delete(`/admin/photos/${photo.id}`);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/photos">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Photo Details</h1>
                    <p className="text-muted-foreground">
                        Taken on {new Date(photo.created_at).toLocaleString()}
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Preview and Print */}
                <Card>
                    <CardHeader>
                        <CardTitle>Print Preview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <DitherPreview
                            imageUrl={photo.url}
                            initialContrast={30}
                            onContrastChange={setContrast}
                        />

                        <div className="space-y-3 pt-4 border-t">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Device</label>
                                <Select
                                    value={selectedDevice}
                                    onValueChange={setSelectedDevice}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a device" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {devices.map((device) => (
                                            <SelectItem
                                                key={device.id}
                                                value={device.id.toString()}
                                            >
                                                {device.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                className="w-full"
                                onClick={handlePrint}
                                disabled={!selectedDevice || isPrinting}
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                {isPrinting ? 'Creating print job...' : 'Print'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Info and History */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Original Photo</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                                <img
                                    src={photo.url}
                                    alt=""
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <div className="mt-4 text-sm text-muted-foreground">
                                Dimensions: {photo.width} x {photo.height}px
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Print History</CardTitle>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Photo
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently
                                            delete the photo and all associated print job history.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete}>
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardHeader>
                        <CardContent>
                            {photo.print_jobs.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    This photo has never been printed
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Device</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {photo.print_jobs.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell>{job.device_name}</TableCell>
                                                <TableCell>
                                                    <StatusBadge status={job.status} />
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {new Date(job.created_at).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

PhotoShow.layout = (page) => <AdminLayout>{page}</AdminLayout>;

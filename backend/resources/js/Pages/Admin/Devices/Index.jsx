import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { router, usePage } from '@inertiajs/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Plus,
    Trash2,
    Copy,
    Check,
    Wifi,
    WifiOff,
    Settings,
} from 'lucide-react';

export default function DevicesIndex({ devices }) {
    const { flash } = usePage().props;
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newDeviceName, setNewDeviceName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newDeviceToken, setNewDeviceToken] = useState(null);
    const [copied, setCopied] = useState(false);

    // Edit device state
    const [editDevice, setEditDevice] = useState(null);
    const [editGamma, setEditGamma] = useState(1.8);
    const [isSaving, setIsSaving] = useState(false);

    // Handle new device token from flash
    useEffect(() => {
        if (flash?.newDevice?.token) {
            setNewDeviceToken(flash.newDevice.token);
        }
    }, [flash]);

    const openEditDialog = (device) => {
        setEditDevice(device);
        setEditGamma(device.gamma);
    };

    const closeEditDialog = () => {
        setEditDevice(null);
    };

    const handleSaveGamma = () => {
        if (!editDevice) return;
        setIsSaving(true);
        router.put(
            `/admin/devices/${editDevice.id}`,
            { gamma: editGamma },
            {
                onSuccess: () => closeEditDialog(),
                onFinish: () => setIsSaving(false),
            }
        );
    };

    const handleCreate = () => {
        setIsCreating(true);
        router.post(
            '/admin/devices',
            { name: newDeviceName },
            {
                onSuccess: () => {
                    setNewDeviceName('');
                    // Keep dialog open to show token
                },
                onFinish: () => setIsCreating(false),
            }
        );
    };

    const handleDelete = (deviceId) => {
        router.delete(`/admin/devices/${deviceId}`);
    };

    const copyToken = () => {
        if (newDeviceToken) {
            navigator.clipboard.writeText(newDeviceToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const closeCreateDialog = () => {
        setIsCreateOpen(false);
        setNewDeviceToken(null);
        setNewDeviceName('');
    };

    const formatLastSeen = (dateString) => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Devices</h1>
                    <p className="text-muted-foreground">Manage connected ESP32 devices</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Device
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        {newDeviceToken ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Device Created</DialogTitle>
                                    <DialogDescription>
                                        Save this token now. It will only be shown once!
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="p-4 bg-muted rounded-lg">
                                        <p className="text-xs text-muted-foreground mb-2">
                                            API Token
                                        </p>
                                        <code className="text-sm break-all">{newDeviceToken}</code>
                                    </div>
                                    <Button onClick={copyToken} className="w-full">
                                        {copied ? (
                                            <>
                                                <Check className="w-4 h-4 mr-2" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-4 h-4 mr-2" />
                                                Copy Token
                                            </>
                                        )}
                                    </Button>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={closeCreateDialog}>
                                        Close
                                    </Button>
                                </DialogFooter>
                            </>
                        ) : (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Add New Device</DialogTitle>
                                    <DialogDescription>
                                        Create a new device and get its API token
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <Input
                                        placeholder="Device name (e.g., ESP32-Booth-1)"
                                        value={newDeviceName}
                                        onChange={(e) => setNewDeviceName(e.target.value)}
                                    />
                                </div>
                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsCreateOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleCreate}
                                        disabled={!newDeviceName || isCreating}
                                    >
                                        {isCreating ? 'Creating...' : 'Create Device'}
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Gamma</TableHead>
                                <TableHead>Last Seen</TableHead>
                                <TableHead>Jobs</TableHead>
                                <TableHead>Printed</TableHead>
                                <TableHead>Pending</TableHead>
                                <TableHead>Failed</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {devices.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={9}
                                        className="text-center text-muted-foreground py-8"
                                    >
                                        No devices registered
                                    </TableCell>
                                </TableRow>
                            ) : (
                                devices.map((device) => (
                                    <TableRow key={device.id}>
                                        <TableCell>
                                            {device.is_online ? (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-green-50 text-green-700 border-green-200"
                                                >
                                                    <Wifi className="w-3 h-3 mr-1" />
                                                    Online
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <WifiOff className="w-3 h-3 mr-1" />
                                                    Offline
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">{device.name}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {device.gamma}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {formatLastSeen(device.last_seen_at)}
                                        </TableCell>
                                        <TableCell>{device.print_jobs_count}</TableCell>
                                        <TableCell className="text-green-600">
                                            {device.printed_count}
                                        </TableCell>
                                        <TableCell className="text-yellow-600">
                                            {device.pending_count}
                                        </TableCell>
                                        <TableCell className="text-red-600">
                                            {device.failed_count}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(device)}
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                Delete {device.name}?
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. The device
                                                                will need to be re-registered with a new
                                                                token.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => handleDelete(device.id)}
                                                            >
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit Device Dialog */}
            <Dialog open={!!editDevice} onOpenChange={(open) => !open && closeEditDialog()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Device Settings</DialogTitle>
                        <DialogDescription>
                            Configure print settings for {editDevice?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Gamma Correction</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                    {editGamma.toFixed(1)}
                                </span>
                            </div>
                            <Slider
                                value={[editGamma]}
                                onValueChange={([value]) => setEditGamma(value)}
                                min={0.5}
                                max={4}
                                step={0.1}
                            />
                            <p className="text-xs text-muted-foreground">
                                Higher values lighten midtones. Recommended: 1.4-2.5
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeEditDialog}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveGamma} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

DevicesIndex.layout = (page) => <AdminLayout>{page}</AdminLayout>;

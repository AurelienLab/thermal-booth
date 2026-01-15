import AdminLayout from '@/layouts/AdminLayout';
import { Link } from '@inertiajs/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Images,
    Printer,
    CheckCircle,
    Clock,
    XCircle,
    TrendingUp,
    Cpu,
} from 'lucide-react';

function StatsCard({ title, value, icon: Icon, description, variant = 'default' }) {
    const variants = {
        default: 'text-foreground',
        success: 'text-green-600',
        warning: 'text-yellow-600',
        danger: 'text-red-600',
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${variants[variant]}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${variants[variant]}`}>{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                )}
            </CardContent>
        </Card>
    );
}

export default function Dashboard({ stats, recentPhotos, activeDevices, totalDevices }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Overview of your photobooth system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Total Photos"
                    value={stats.totalPhotos}
                    icon={Images}
                />
                <StatsCard
                    title="Total Print Jobs"
                    value={stats.totalPrintJobs}
                    icon={Printer}
                />
                <StatsCard
                    title="Printed"
                    value={stats.printedJobs}
                    icon={CheckCircle}
                    variant="success"
                />
                <StatsCard
                    title="Pending"
                    value={stats.pendingJobs}
                    icon={Clock}
                    variant="warning"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatsCard
                    title="Failed Jobs"
                    value={stats.failedJobs}
                    icon={XCircle}
                    variant="danger"
                />
                <StatsCard
                    title="Success Rate"
                    value={`${stats.successRate}%`}
                    icon={TrendingUp}
                    variant={stats.successRate >= 90 ? 'success' : stats.successRate >= 70 ? 'warning' : 'danger'}
                />
                <StatsCard
                    title="Active Devices"
                    value={`${activeDevices.length} / ${totalDevices}`}
                    icon={Cpu}
                    variant={activeDevices.length > 0 ? 'success' : 'warning'}
                    description="Online in the last 5 minutes"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Photos */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Recent Photos</span>
                            <Link
                                href="/admin/photos"
                                className="text-sm font-normal text-muted-foreground hover:text-foreground"
                            >
                                View all
                            </Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recentPhotos.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No photos yet</p>
                        ) : (
                            <div className="grid grid-cols-5 gap-2">
                                {recentPhotos.map((photo) => (
                                    <Link
                                        key={photo.id}
                                        href={`/admin/photos/${photo.id}`}
                                        className="relative aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                                    >
                                        <img
                                            src={photo.url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                        {photo.print_count > 0 && (
                                            <Badge
                                                variant="secondary"
                                                className="absolute bottom-1 right-1 text-xs px-1"
                                            >
                                                {photo.print_count}
                                            </Badge>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Active Devices */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Active Devices</span>
                            <Link
                                href="/admin/devices"
                                className="text-sm font-normal text-muted-foreground hover:text-foreground"
                            >
                                Manage
                            </Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activeDevices.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No devices online</p>
                        ) : (
                            <div className="space-y-3">
                                {activeDevices.map((device) => (
                                    <div
                                        key={device.id}
                                        className="flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-green-500 rounded-full" />
                                            <span className="font-medium">{device.name}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(device.last_seen_at).toLocaleTimeString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

Dashboard.layout = (page) => <AdminLayout>{page}</AdminLayout>;

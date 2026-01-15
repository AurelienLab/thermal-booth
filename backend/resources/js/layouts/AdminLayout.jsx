import { Link, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarProvider,
    SidebarTrigger,
    SidebarInset,
    SidebarGroup,
    SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Toaster, toast } from 'sonner';
import {
    LayoutDashboard,
    Images,
    Printer,
    Cpu,
    LogOut,
} from 'lucide-react';

const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Photos', href: '/admin/photos', icon: Images },
    { name: 'Print Jobs', href: '/admin/print-jobs', icon: Printer },
    { name: 'Devices', href: '/admin/devices', icon: Cpu },
];

export default function AdminLayout({ children }) {
    const { flash, url } = usePage().props;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

    const isActive = (href) => {
        const currentPath = window.location.pathname;
        if (href === '/admin') {
            return currentPath === '/admin';
        }
        return currentPath.startsWith(href);
    };

    return (
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader className="border-b px-4 py-3">
                    <Link href="/admin" className="flex items-center gap-2">
                        <Printer className="h-6 w-6" />
                        <span className="font-semibold text-lg">ThermalBooth</span>
                    </Link>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {navigation.map((item) => (
                                    <SidebarMenuItem key={item.name}>
                                        <SidebarMenuButton asChild isActive={isActive(item.href)}>
                                            <Link href={item.href}>
                                                <item.icon className="h-4 w-4" />
                                                <span>{item.name}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter className="border-t">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <Link href="/admin/logout" method="post" as="button" className="w-full">
                                    <LogOut className="h-4 w-4" />
                                    <span>Logout</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <header className="flex h-14 items-center gap-4 border-b px-6">
                    <SidebarTrigger />
                </header>
                <main className="flex-1 p-6">
                    {children}
                </main>
            </SidebarInset>
            <Toaster position="top-right" />
        </SidebarProvider>
    );
}

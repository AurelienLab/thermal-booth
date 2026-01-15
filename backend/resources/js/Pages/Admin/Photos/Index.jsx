import AdminLayout from '@/layouts/AdminLayout';
import { Link, router } from '@inertiajs/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';

export default function PhotosIndex({ photos, devices }) {
    const { data, links, current_page, last_page } = photos;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Photos</h1>
                    <p className="text-muted-foreground">Browse and print photos from the gallery</p>
                </div>
            </div>

            {data.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">No photos yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Take photos using the PWA to see them here
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {data.map((photo) => (
                            <Link
                                key={photo.id}
                                href={`/admin/photos/${photo.id}`}
                                className="group relative aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
                            >
                                <img
                                    src={photo.url}
                                    alt=""
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                    {photo.print_count > 0 && (
                                        <Badge variant="secondary" className="text-xs">
                                            <Printer className="w-3 h-3 mr-1" />
                                            {photo.print_count}
                                        </Badge>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Pagination */}
                    {last_page > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={current_page === 1}
                                onClick={() => router.get(`/admin/photos?page=${current_page - 1}`)}
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
                                onClick={() => router.get(`/admin/photos?page=${current_page + 1}`)}
                            >
                                Next
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

PhotosIndex.layout = (page) => <AdminLayout>{page}</AdminLayout>;

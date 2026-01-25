import { useState } from 'react';
import { router } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Plus,
    Trash2,
    GripVertical,
    Type,
    Minus,
    QrCode,
    MoveDown,
    Bold,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Printer,
    ChevronUp,
    ChevronDown,
    Square,
} from 'lucide-react';

const BLOCK_TYPES = [
    { value: 'text', label: 'Text', icon: Type },
    { value: 'separator', label: 'Separator', icon: Minus },
    { value: 'qr', label: 'QR Code', icon: QrCode },
    { value: 'feed', label: 'Line Feed', icon: MoveDown },
];

const TEXT_SIZES = [
    { value: 'normal', label: 'Normal' },
    { value: 'wide', label: 'Wide (2x)' },
    { value: 'tall', label: 'Tall (2x)' },
    { value: 'big', label: 'Big (2x2)' },
];

function TextBlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
    const updateField = (field, value) => {
        onChange({ ...block, [field]: value });
    };

    const toggleField = (field) => {
        onChange({ ...block, [field]: !block[field] });
    };

    return (
        <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onMoveUp}
                        disabled={isFirst}
                    >
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onMoveDown}
                        disabled={isLast}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 space-y-3">
                    {block.type === 'text' && (
                        <>
                            <Input
                                value={block.content || ''}
                                onChange={(e) => updateField('content', e.target.value)}
                                placeholder="Enter text..."
                                className="font-mono"
                            />
                            <div className="flex flex-wrap gap-2">
                                <div className="flex border rounded-md">
                                    <Button
                                        variant={block.align === 'left' || !block.align ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-r-none"
                                        onClick={() => updateField('align', 'left')}
                                    >
                                        <AlignLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={block.align === 'center' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-none border-x"
                                        onClick={() => updateField('align', 'center')}
                                    >
                                        <AlignCenter className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={block.align === 'right' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-l-none"
                                        onClick={() => updateField('align', 'right')}
                                    >
                                        <AlignRight className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="flex border rounded-md">
                                    <Button
                                        variant={block.bold ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-r-none"
                                        onClick={() => toggleField('bold')}
                                    >
                                        <Bold className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={block.underline ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-none border-x"
                                        onClick={() => toggleField('underline')}
                                    >
                                        <Underline className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={block.invert ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8 rounded-l-none"
                                        onClick={() => toggleField('invert')}
                                        title="Invert (white on black)"
                                    >
                                        <Square className="h-4 w-4 fill-current" />
                                    </Button>
                                </div>

                                <Select
                                    value={block.size || 'normal'}
                                    onValueChange={(value) => updateField('size', value)}
                                >
                                    <SelectTrigger className="w-32 h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEXT_SIZES.map((size) => (
                                            <SelectItem key={size.value} value={size.value}>
                                                {size.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    {block.type === 'separator' && (
                        <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground">Character:</Label>
                            <Input
                                value={block.char || '-'}
                                onChange={(e) => updateField('char', e.target.value.slice(0, 1))}
                                className="w-16 text-center font-mono"
                                maxLength={1}
                            />
                            <span className="text-sm text-muted-foreground">
                                Preview: {(block.char || '-').repeat(32)}
                            </span>
                        </div>
                    )}

                    {block.type === 'qr' && (
                        <div className="space-y-2">
                            <Input
                                value={block.content || ''}
                                onChange={(e) => updateField('content', e.target.value)}
                                placeholder="URL or text to encode..."
                            />
                            <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">Size:</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={16}
                                    value={block.size || 6}
                                    onChange={(e) => updateField('size', parseInt(e.target.value) || 6)}
                                    className="w-20"
                                />
                                <span className="text-sm text-muted-foreground">(1-16)</span>
                            </div>
                        </div>
                    )}

                    {block.type === 'feed' && (
                        <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground">Lines:</Label>
                            <Input
                                type="number"
                                min={1}
                                max={10}
                                value={block.lines || 1}
                                onChange={(e) => updateField('lines', parseInt(e.target.value) || 1)}
                                className="w-20"
                            />
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={onRemove}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

const CHARS_PER_LINE = 32;

function wordWrap(text, width) {
    if (!text) return [''];
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        // If word is longer than width, split it
        if (word.length > width) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            let remaining = word;
            while (remaining.length > width) {
                lines.push(remaining.slice(0, width));
                remaining = remaining.slice(width);
            }
            if (remaining) {
                currentLine = remaining;
            }
            continue;
        }

        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= width) {
            currentLine = testLine;
        } else {
            if (currentLine) {
                lines.push(currentLine);
            }
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length ? lines : [''];
}

function PreviewBlock({ block }) {
    const alignClass = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
    }[block.align || 'left'];

    const sizeClass = {
        normal: 'text-sm',
        wide: 'text-sm tracking-[0.5em]',
        tall: 'text-lg',
        big: 'text-lg tracking-[0.5em]',
    }[block.size || 'normal'];

    // Calculate effective width based on size
    const effectiveWidth = (block.size === 'wide' || block.size === 'big')
        ? CHARS_PER_LINE / 2
        : CHARS_PER_LINE;

    if (block.type === 'text') {
        const lines = wordWrap(block.content || '', effectiveWidth);
        return (
            <div
                className={`${alignClass} ${sizeClass} ${block.bold ? 'font-bold' : ''} ${block.underline ? 'underline' : ''} ${block.invert ? 'bg-black text-white px-1' : ''}`}
            >
                {lines.map((line, i) => (
                    <div key={i}>{line || '\u00A0'}</div>
                ))}
            </div>
        );
    }

    if (block.type === 'separator') {
        return (
            <div className="text-center">
                {(block.char || '-').repeat(CHARS_PER_LINE)}
            </div>
        );
    }

    if (block.type === 'qr') {
        return (
            <div className="text-center py-2">
                <div className="inline-block border-2 border-dashed border-muted-foreground p-4">
                    <QrCode className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div className="text-xs text-muted-foreground mt-1 max-w-[150px] truncate">
                        {block.content || 'QR Code'}
                    </div>
                </div>
            </div>
        );
    }

    if (block.type === 'feed') {
        return <div style={{ height: `${(block.lines || 1) * 1.2}em` }} />;
    }

    return null;
}

export default function TextPrint({ devices }) {
    const [blocks, setBlocks] = useState([
        { type: 'text', content: '', align: 'center', size: 'normal' },
    ]);

    const [deviceId, setDeviceId] = useState(
        devices.find(d => d.online)?.id?.toString() || devices[0]?.id?.toString() || ''
    );
    const [processing, setProcessing] = useState(false);

    const addBlock = (type) => {
        const newBlock = { type };
        if (type === 'text') {
            newBlock.content = '';
            newBlock.align = 'left';
            newBlock.size = 'normal';
        } else if (type === 'separator') {
            newBlock.char = '-';
        } else if (type === 'qr') {
            newBlock.content = '';
            newBlock.size = 6;
        } else if (type === 'feed') {
            newBlock.lines = 1;
        }
        setBlocks([...blocks, newBlock]);
    };

    const updateBlock = (index, updatedBlock) => {
        const newBlocks = [...blocks];
        newBlocks[index] = updatedBlock;
        setBlocks(newBlocks);
    };

    const removeBlock = (index) => {
        setBlocks(blocks.filter((_, i) => i !== index));
    };

    const moveBlock = (index, direction) => {
        const newBlocks = [...blocks];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= blocks.length) return;
        [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
        setBlocks(newBlocks);
    };

    const handlePrint = () => {
        setProcessing(true);
        router.post('/admin/text-print', {
            device_id: deviceId,
            blocks: blocks,
        }, {
            onFinish: () => setProcessing(false),
        });
    };

    const onlineDevices = devices.filter(d => d.online);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Text Print</h1>
                <p className="text-muted-foreground">Create and print custom text with formatting</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Editor */}
                <Card>
                    <CardHeader>
                        <CardTitle>Editor</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {blocks.map((block, index) => (
                            <TextBlockEditor
                                key={index}
                                block={block}
                                onChange={(updated) => updateBlock(index, updated)}
                                onRemove={() => removeBlock(index)}
                                onMoveUp={() => moveBlock(index, -1)}
                                onMoveDown={() => moveBlock(index, 1)}
                                isFirst={index === 0}
                                isLast={index === blocks.length - 1}
                            />
                        ))}

                        <div className="flex flex-wrap gap-2 pt-2">
                            {BLOCK_TYPES.map((type) => (
                                <Button
                                    key={type.value}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addBlock(type.value)}
                                >
                                    <type.icon className="h-4 w-4 mr-1" />
                                    {type.label}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Preview & Print */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-white text-black p-4 rounded border font-mono text-xs min-h-[200px]" style={{ width: '100%', maxWidth: '384px' }}>
                                {blocks.map((block, index) => (
                                    <PreviewBlock key={index} block={block} />
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                58mm thermal printer (32 characters per line)
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Print</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Device</Label>
                                <Select
                                    value={deviceId}
                                    onValueChange={(value) => setDeviceId(value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a device" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {devices.map((device) => (
                                            <SelectItem
                                                key={device.id}
                                                value={device.id.toString()}
                                                disabled={!device.online}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${device.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                    {device.name}
                                                    {!device.online && ' (offline)'}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                className="w-full"
                                onClick={handlePrint}
                                disabled={processing || blocks.length === 0 || !deviceId}
                            >
                                <Printer className="h-4 w-4 mr-2" />
                                {processing ? 'Sending...' : 'Print'}
                            </Button>

                            {onlineDevices.length === 0 && (
                                <p className="text-sm text-destructive">
                                    No devices online
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

TextPrint.layout = (page) => <AdminLayout>{page}</AdminLayout>;

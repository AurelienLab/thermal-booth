<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DeviceAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $device = Device::where('api_token_hash', hash('sha256', $token))->first();

        if (!$device) {
            return response()->json(['error' => 'Invalid token'], 401);
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}

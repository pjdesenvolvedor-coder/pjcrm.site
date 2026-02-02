"use client"

import { Bar, BarChart, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartTooltipContent, ChartContainer } from "@/components/ui/chart"

const messageData = [
  { date: "Jan", messages: 340 },
  { date: "Fev", messages: 450 },
  { date: "Mar", messages: 390 },
  { date: "Abr", messages: 520 },
  { date: "Mai", messages: 480 },
  { date: "Jun", messages: 610 },
];

const engagementData = [
    { month: "Jan", engagement: 65 },
    { month: "Fev", engagement: 59 },
    { month: "Mar", engagement: 80 },
    { month: "Abr", engagement: 81 },
    { month: "Mai", engagement: 56 },
    { month: "Jun", engagement: 72 },
];


const chartConfig = {
  messages: {
    label: "Mensagens",
    color: "hsl(var(--primary))",
  },
  engagement: {
    label: "Engajamento",
    color: "hsl(var(--accent))",
  }
}

export function DashboardCharts() {
  return (
    <>
      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle>Volume de Mensagens</CardTitle>
          <CardDescription>Total de mensagens trocadas nos últimos 6 meses.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={messageData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                />
                <YAxis />
                <Tooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="messages" fill="var(--color-messages)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Taxa de Engajamento</CardTitle>
          <CardDescription>Engajamento dos clientes ao longo do tempo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart data={engagementData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                />
                <YAxis />
                <Tooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Line type="monotone" dataKey="engagement" stroke="var(--color-engagement)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </>
  )
}
